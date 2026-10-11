import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { MigrationRunner, TenantDatabaseSession } from './migration-runner.js';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

function getMigrationsDir(): string {
  const rootMigrations = join(process.cwd(), 'packages/shared-types/migrations');
  const localMigrations = join(process.cwd(), 'migrations');
  return existsSync(rootMigrations) ? rootMigrations : localMigrations;
}

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://ledger_app:ledger_app_secure_pass@localhost:9527/ledger_ae_test';

describe('PostgreSQL Row-Level Security (RLS) & Immutability Real Postgres Tests', () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });

  const tenantA = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const tenantB = '22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const entityA = '10000000-0000-0000-0000-000000000011';
  const entityB = '10000000-0000-0000-0000-000000000022';
  const userA = '30000000-0000-0000-0000-000000000011';
  const userB = '30000000-0000-0000-0000-000000000022';
  const custA = '20000000-0000-0000-0000-000000000011';
  const custB = '20000000-0000-0000-0000-000000000022';

  const tenantSession = new TenantDatabaseSession(pool);

  test('Setup: Run migrations and seed baseline records', async () => {
    const runner = new MigrationRunner(pool);
    await runner.runMigrations({ migrationsDir: getMigrationsDir() });

    // Seed Tenant A baseline records under Tenant A session context
    await tenantSession.withTenant(tenantA, async (client) => {
      await client.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, 'Tenant A Corp', 'tenant-a') ON CONFLICT (id) DO NOTHING`, [tenantA]);
      await client.query(`INSERT INTO legal_entities (id, tenant_id, legal_name_en, legal_name_ar, trade_license_number, jurisdiction_type, base_currency, address_emirate)
        VALUES ($1, $2, 'Entity A LLC', 'كيان أ', 'TL-A', 'MAINLAND', 'AED', 'DUBAI') ON CONFLICT (id) DO NOTHING`, [entityA, tenantA]);
      await client.query(`INSERT INTO users (id, tenant_id, email, full_name_en, role)
        VALUES ($1, $2, 'user.a@tenanta.ae', 'User A', 'ACCOUNTANT') ON CONFLICT (id) DO NOTHING`, [userA, tenantA]);
    });

    // Seed Tenant B baseline records under Tenant B session context
    await tenantSession.withTenant(tenantB, async (client) => {
      await client.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, 'Tenant B Corp', 'tenant-b') ON CONFLICT (id) DO NOTHING`, [tenantB]);
      await client.query(`INSERT INTO legal_entities (id, tenant_id, legal_name_en, legal_name_ar, trade_license_number, jurisdiction_type, base_currency, address_emirate)
        VALUES ($1, $2, 'Entity B LLC', 'كيان ب', 'TL-B', 'FINANCIAL_FREE_ZONE', 'USD', 'ABU_DHABI') ON CONFLICT (id) DO NOTHING`, [entityB, tenantB]);
      await client.query(`INSERT INTO users (id, tenant_id, email, full_name_en, role)
        VALUES ($1, $2, 'user.b@tenantb.ae', 'User B', 'ACCOUNTANT') ON CONFLICT (id) DO NOTHING`, [userB, tenantB]);
    });
  });

  test('RLS Isolation: Tenant A cannot see Tenant B customers under RLS session', async () => {
    await tenantSession.withTenant(tenantA, async (client) => {
      await client.query(`INSERT INTO customers (id, tenant_id, legal_entity_id, customer_number, name_en, currency)
        VALUES ($1, $2, $3, 'CUST-A-01', 'Tenant A Exclusive Customer', 'AED') ON CONFLICT (id) DO NOTHING`, [custA, tenantA, entityA]);
    });

    await tenantSession.withTenant(tenantB, async (client) => {
      await client.query(`INSERT INTO customers (id, tenant_id, legal_entity_id, customer_number, name_en, currency)
        VALUES ($1, $2, $3, 'CUST-B-01', 'Tenant B Secret Customer', 'USD') ON CONFLICT (id) DO NOTHING`, [custB, tenantB, entityB]);
    });

    // Query under Tenant A context
    await tenantSession.withTenant(tenantA, async (client) => {
      const res = await client.query('SELECT * FROM customers');
      assert.ok(res.rows.length >= 1);
      assert.ok(res.rows.every((r: any) => r.tenant_id === tenantA));
      assert.equal(res.rows.some((r: any) => r.tenant_id === tenantB), false);

      // Attempt cross-tenant read by direct primary key
      const crossRead = await client.query('SELECT * FROM customers WHERE id = $1', [custB]);
      assert.equal(crossRead.rows.length, 0, 'Cross-tenant SELECT must return 0 rows under FORCE RLS');

      // Attempt cross-tenant UPDATE
      const crossUpdate = await client.query('UPDATE customers SET name_en = $1 WHERE id = $2', ['Hacked', custB]);
      assert.equal(crossUpdate.rowCount, 0, 'Cross-tenant UPDATE must affect 0 rows under FORCE RLS');

      // Attempt cross-tenant DELETE
      const crossDelete = await client.query('DELETE FROM customers WHERE id = $1', [custB]);
      assert.equal(crossDelete.rowCount, 0, 'Cross-tenant DELETE must affect 0 rows under FORCE RLS');
    });

    // Query under Tenant B context
    await tenantSession.withTenant(tenantB, async (client) => {
      const res = await client.query('SELECT * FROM customers');
      assert.ok(res.rows.length >= 1);
      assert.ok(res.rows.every((r: any) => r.tenant_id === tenantB));
      assert.equal(res.rows.some((r: any) => r.tenant_id === tenantA), false);
    });
  });

  test('Immutability Trigger: Database blocks UPDATE or DELETE on posted journal vouchers', async () => {
    const bookId = '40000000-0000-0000-0000-000000000011';
    const periodId = '50000000-0000-0000-0000-000000000011';
    const jId = '70000000-0000-0000-0000-000000000011';

    await tenantSession.withTenant(tenantA, async (client) => {
      await client.query(`INSERT INTO books (id, tenant_id, legal_entity_id, book_code, currency, is_primary)
        VALUES ($1, $2, $3, 'STATUTORY_IFRS', 'AED', true) ON CONFLICT (id) DO NOTHING`, [bookId, tenantA, entityA]);
      await client.query(`INSERT INTO accounting_periods (id, tenant_id, legal_entity_id, fiscal_year, period_number, start_date, end_date)
        VALUES ($1, $2, $3, 2026, 1, '2026-01-01', '2026-01-31') ON CONFLICT (id) DO NOTHING`, [periodId, tenantA, entityA]);
      await client.query(`INSERT INTO journal_entries (id, tenant_id, legal_entity_id, book_id, period_id, entry_number, posting_date, document_date, status, source_module, memo_en, created_by, entry_hash)
        VALUES ($1, $2, $3, $4, $5, 'JV-TEST-IMMUTABLE', '2026-01-15', '2026-01-15', 'POSTED', 'GL', 'Test Immutable', $6, 'hash123')
        ON CONFLICT (id) DO NOTHING`, [jId, tenantA, entityA, bookId, periodId, userA]);
    });

    // Verify UPDATE is blocked by trigger
    await assert.rejects(async () => {
      await tenantSession.withTenant(tenantA, async (client) => {
        await client.query(`UPDATE journal_entries SET memo_en = 'Mutated' WHERE id = $1`, [jId]);
      });
    }, /strictly immutable and cannot be modified/);

    // Verify DELETE is blocked by trigger
    await assert.rejects(async () => {
      await tenantSession.withTenant(tenantA, async (client) => {
        await client.query(`DELETE FROM journal_entries WHERE id = $1`, [jId]);
      });
    }, /strictly immutable and cannot be deleted/);
  });

  test('Cleanup test pool', async () => {
    await pool.end();
  });
});
