import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { TenantDatabaseSession } from '@ledger-ae/shared-types';
import { LedgerRepository, Direction, PeriodLockedException } from '@ledger-ae/ledger-core';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://ledger_app:ledger_app_secure_pass@localhost:9527/ledger_ae_test';

async function runDrill() {
  console.log('--- Phase 1 Integrity Drill on Real Postgres ---');
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const repo = new LedgerRepository(pool);
  const tenantSession = new TenantDatabaseSession(pool);

  const emptyTenantId = '99990000-0000-0000-0000-000000000001';
  const emptyEntityId = '99990000-0000-0000-0000-000000000002';
  const emptyUserId = '99990000-0000-0000-0000-000000000003';

  // 1. Setup clean empty tenant
  await tenantSession.withTenant(emptyTenantId, async (client) => {
    await client.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, 'Empty Corp', 'empty-corp') ON CONFLICT (id) DO NOTHING`, [emptyTenantId]);
    await client.query(`INSERT INTO legal_entities (id, tenant_id, legal_name_en, legal_name_ar, trade_license_number, trn, jurisdiction_type, base_currency, address_emirate)
      VALUES ($1, $2, 'Empty Entity', 'كيان فارغ', 'TL-EMPTY', '100999999999003', 'MAINLAND', 'AED', 'DUBAI') ON CONFLICT (id) DO NOTHING`, [emptyEntityId, emptyTenantId]);
  });

  // 2. Verify empty ledger returns 0 rows, properly labelled
  const emptyJournals = await repo.listJournalEntries({
    tenantId: emptyTenantId,
    entityId: emptyEntityId,
    userId: emptyUserId
  });
  assert.equal(emptyJournals.length, 0, 'Empty tenant must have 0 journal entries');
  console.log('✓ Empty ledger returns 0 journal entries (No mock vouchers).');

  // 3. Verify real seeded tenant returns real database data
  const seededTenantId = '00000000-0000-0000-0000-000000000001';
  const seededEntityId = '00000000-0000-0000-0000-000000000001';
  const seededUserId = '00000000-0000-0000-0000-000000000001';

  const seededJournals = await repo.listJournalEntries({
    tenantId: seededTenantId,
    entityId: seededEntityId,
    userId: seededUserId
  });
  assert.ok(seededJournals.length >= 2, `Seeded tenant must have >= 2 posted journals from DB (got ${seededJournals.length})`);
  console.log(`✓ Seeded tenant returns ${seededJournals.length} real journals from database.`);

  // 4. Test VAT 201 generation on empty tenant
  const emptyVat = await repo.generateVat201FromLedger(
    { tenantId: emptyTenantId, entityId: emptyEntityId, userId: emptyUserId },
    '00000000-0000-0000-0000-000000000003',
    '100999999999003'
  );
  assert.equal(emptyVat.totalOutputTax, 0n, 'Empty VAT return output tax must be 0 fils');
  assert.equal(emptyVat.totalInputTax, 0n, 'Empty VAT return input tax must be 0 fils');
  assert.equal(emptyVat.netTaxPayableOrReclaimable, 0n, 'Empty VAT return net payable must be 0 fils');
  console.log('✓ Empty VAT return dynamically calculates 0 fils across all boxes.');

  // 5. Test VAT 201 generation on seeded tenant
  const seededVat = await repo.generateVat201FromLedger(
    { tenantId: seededTenantId, entityId: seededEntityId, userId: seededUserId },
    '00000000-0000-0000-0000-000000000003',
    '100456789012345'
  );
  assert.ok(seededVat.totalOutputTax > 0n, 'Seeded VAT return has real output tax');
  console.log(`✓ Seeded VAT return has real computed output tax: ${seededVat.totalOutputTax} fils.`);

  await pool.end();
  console.log('--- Phase 1 Integrity Drill Completed Successfully ---');
}

runDrill().catch((err) => {
  console.error('Drill failed:', err);
  process.exit(1);
});
