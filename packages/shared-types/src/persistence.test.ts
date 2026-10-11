import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newDb, DataType } from 'pg-mem';
import { MigrationRunner, TenantDatabaseSession } from './migration-runner.js';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

function getMigrationsDir(): string {
  const rootMigrations = join(process.cwd(), 'packages/shared-types/migrations');
  const localMigrations = join(process.cwd(), 'migrations');
  return existsSync(rootMigrations) ? rootMigrations : localMigrations;
}

function setupPgMemDb(uuidGenerator: () => string) {
  const memDb = newDb({ noAstCoverageCheck: true });
  memDb.public.registerFunction({
    name: 'gen_random_uuid',
    implementation: uuidGenerator
  });
  memDb.public.registerFunction({
    name: 'length',
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (str: string | null) => (str ? str.length : 0)
  });
  const pool = memDb.adapters.createPg().Pool as any;
  const pgPool = new pool();
  (pgPool as any).isPgMem = true;
  return { memDb, pgPool };
}

describe('Phase 1: Persistence & Multi-Tenant RLS Integration Tests', () => {
  it('Applies all SQL migrations cleanly and idempotently', async () => {
    const { pgPool } = setupPgMemDb(() => '11111111-2222-3333-4444-555555555555');

    const migrationsDir = getMigrationsDir();
    const runner = new MigrationRunner(pgPool);

    // 1. Initial Migration Run
    const appliedFirst = await runner.runMigrations({ migrationsDir });
    assert.equal(appliedFirst.length, 4, 'Should apply 4 migrations on first run');
    assert.deepEqual(appliedFirst, [
      '0001_core_ledger.sql',
      '0002_operations_schema.sql',
      '0003_rag_documents_and_guidance.sql',
      '0004_workflow_runs_and_webhooks.sql'
    ]);

    // 2. Idempotent Second Migration Run
    const appliedSecond = await runner.runMigrations({ migrationsDir });
    assert.equal(appliedSecond.length, 0, 'Zero migrations should apply on second run');

    await pgPool.end();
  });

  it('Enforces Row-Level Security (RLS) tenant isolation: Tenant A cannot read or mutate Tenant B records', async () => {
    let uuidCounter = 1;
    const { pgPool } = setupPgMemDb(() => `00000000-0000-0000-0000-${String(uuidCounter++).padStart(12, '0')}`);

    const migrationsDir = getMigrationsDir();
    const runner = new MigrationRunner(pgPool);
    await runner.runMigrations({ migrationsDir });

    const tenantSession = new TenantDatabaseSession(pgPool);

    const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    // Seed Tenant A and Tenant B records
    await tenantSession.withTenant(tenantA, async (client) => {
      await client.query(`
        INSERT INTO tenants (id, name, slug) VALUES ($1, 'Al Noor Group', 'al-noor-group')
      `, [tenantA]);

      await client.query(`
        INSERT INTO legal_entities (id, tenant_id, legal_name_en, legal_name_ar, trade_license_number, jurisdiction_type, base_currency, address_emirate)
        VALUES ('10000000-0000-0000-0000-000000000001', $1, 'Al Noor Mainland LLC', 'شركة النور ش.ذ.م.م', 'TL-DXB-991', 'MAINLAND', 'AED', 'DUBAI')
      `, [tenantA]);

      await client.query(`
        INSERT INTO customers (id, tenant_id, legal_entity_id, customer_number, name_en, currency)
        VALUES ('20000000-0000-0000-0000-000000000001', $1, '10000000-0000-0000-0000-000000000001', 'CUST-001', 'Emaar Properties PJSC', 'AED')
      `, [tenantA]);
    });

    await tenantSession.withTenant(tenantB, async (client) => {
      await client.query(`
        INSERT INTO tenants (id, name, slug) VALUES ($1, 'ADGM Capital Group', 'adgm-capital-group')
      `, [tenantB]);

      await client.query(`
        INSERT INTO legal_entities (id, tenant_id, legal_name_en, legal_name_ar, trade_license_number, jurisdiction_type, base_currency, address_emirate)
        VALUES ('10000000-0000-0000-0000-000000000002', $1, 'ADGM Capital Partners Ltd', 'أدغم كابيتال', 'ADGM-TL-441', 'FINANCIAL_FREE_ZONE', 'USD', 'ABU_DHABI')
      `, [tenantB]);

      await client.query(`
        INSERT INTO customers (id, tenant_id, legal_entity_id, customer_number, name_en, currency)
        VALUES ('20000000-0000-0000-0000-000000000002', $1, '10000000-0000-0000-0000-000000000002', 'CUST-002', 'Mubadala Investment Co', 'USD')
      `, [tenantB]);
    });

    // Verify Tenant A query returns ONLY Tenant A data
    await tenantSession.withTenant(tenantA, async (client) => {
      const resEntities = await client.query('SELECT * FROM legal_entities');
      assert.equal(resEntities.rows.length, 1);
      assert.equal(resEntities.rows[0].legal_name_en, 'Al Noor Mainland LLC');

      const resCustomers = await client.query('SELECT * FROM customers');
      assert.equal(resCustomers.rows.length, 1);
      assert.equal(resCustomers.rows[0].name_en, 'Emaar Properties PJSC');
    });

    // Verify Tenant B query returns ONLY Tenant B data
    await tenantSession.withTenant(tenantB, async (client) => {
      const resEntities = await client.query('SELECT * FROM legal_entities');
      assert.equal(resEntities.rows.length, 1);
      assert.equal(resEntities.rows[0].legal_name_en, 'ADGM Capital Partners Ltd');

      const resCustomers = await client.query('SELECT * FROM customers');
      assert.equal(resCustomers.rows.length, 1);
      assert.equal(resCustomers.rows[0].name_en, 'Mubadala Investment Co');
    });

    // Cross-tenant breach attempt: Tenant A attempts to update or read Tenant B customer ID
    await tenantSession.withTenant(tenantA, async (client) => {
      const crossRead = await client.query('SELECT * FROM customers WHERE id = $1', ['20000000-0000-0000-0000-000000000002']);
      assert.equal(crossRead.rows.length, 0, 'Cross-tenant read must return 0 rows under RLS');

      const crossUpdate = await client.query('UPDATE customers SET name_en = $1 WHERE id = $2', [
        'Hacked Customer Name',
        '20000000-0000-0000-0000-000000000002'
      ]);
      assert.equal(crossUpdate.rowCount, 0, 'Cross-tenant update must affect 0 rows under RLS');
    });

    await pgPool.end();
  });
});
