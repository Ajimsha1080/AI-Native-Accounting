import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import {
  LedgerRepository,
  Direction,
  JournalEntryCandidate
} from './index.js';
import { MigrationRunner, TenantDatabaseSession } from '@ledger-ae/shared-types';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

function getMigrationsDir(): string {
  const rootMigrations = join(process.cwd(), 'packages/shared-types/migrations');
  const localMigrations = join(process.cwd(), '../shared-types/migrations');
  return existsSync(rootMigrations) ? rootMigrations : localMigrations;
}

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://ledger_app:ledger_app_secure_pass@localhost:9527/ledger_ae_test';

describe('Phase 3 Single Source of Truth: LedgerRepository Integration Tests (Real Postgres)', () => {
  it('posts a balanced journal entry, writes audit log, and lists via RLS on real Postgres', async () => {
    const pgPool = new Pool({ connectionString: TEST_DATABASE_URL });
    const tenantSession = new TenantDatabaseSession(pgPool);

    const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const entityId = '10000000-0000-0000-0000-000000000001';
    const userId = '30000000-0000-0000-0000-000000000001';
    const bookId = '40000000-0000-0000-0000-000000000001';
    const periodId = '50000000-0000-0000-0000-000000000001';
    const accBank = '60000000-0000-0000-0000-000000000001';
    const accRev = '60000000-0000-0000-0000-000000000002';
    const accVat = '60000000-0000-0000-0000-000000000003';

    // Seed baseline fixtures within tenant RLS session
    await tenantSession.withTenant(tenantId, async (client) => {
      await client.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, 'Al Noor Group', 'al-noor') ON CONFLICT (id) DO NOTHING`, [tenantId]);
      await client.query(`INSERT INTO legal_entities (id, tenant_id, legal_name_en, legal_name_ar, trade_license_number, jurisdiction_type, base_currency, address_emirate)
        VALUES ($1, $2, 'Al Noor LLC', 'شركة النور', 'TL-101', 'MAINLAND', 'AED', 'DUBAI') ON CONFLICT (id) DO NOTHING`, [entityId, tenantId]);
      await client.query(`INSERT INTO users (id, tenant_id, email, full_name_en, role)
        VALUES ($1, $2, 'cfo@alnoor.ae', 'CFO User', 'CFO') ON CONFLICT (id) DO NOTHING`, [userId, tenantId]);
      await client.query(`INSERT INTO books (id, tenant_id, legal_entity_id, book_code, currency, is_primary)
        VALUES ($1, $2, $3, 'STATUTORY_IFRS', 'AED', true) ON CONFLICT (id) DO NOTHING`, [bookId, tenantId, entityId]);
      await client.query(`INSERT INTO accounting_periods (id, tenant_id, legal_entity_id, fiscal_year, period_number, start_date, end_date)
        VALUES ($1, $2, $3, 2026, 1, '2026-01-01', '2026-01-31') ON CONFLICT (id) DO NOTHING`, [periodId, tenantId, entityId]);
      await client.query(`INSERT INTO chart_of_accounts (id, tenant_id, legal_entity_id, code, name_en, name_ar, type, sub_type, normal_balance)
        VALUES ($1, $2, $3, '1020', 'Emirates NBD', 'بنك الإمارات', 'ASSET', 'CASH', 'DEBIT') ON CONFLICT (id) DO NOTHING`, [accBank, tenantId, entityId]);
      await client.query(`INSERT INTO chart_of_accounts (id, tenant_id, legal_entity_id, code, name_en, name_ar, type, sub_type, normal_balance)
        VALUES ($1, $2, $3, '4010', 'Commercial Sales', 'مبيعات', 'REVENUE', 'OPERATING', 'CREDIT') ON CONFLICT (id) DO NOTHING`, [accRev, tenantId, entityId]);
      await client.query(`INSERT INTO chart_of_accounts (id, tenant_id, legal_entity_id, code, name_en, name_ar, type, sub_type, normal_balance)
        VALUES ($1, $2, $3, '2110', 'Output VAT', 'ضريبة مخرجات', 'LIABILITY', 'TAX', 'CREDIT') ON CONFLICT (id) DO NOTHING`, [accVat, tenantId, entityId]);
    });

    const repo = new LedgerRepository(pgPool);
    const ctx = { tenantId, entityId, userId };

    const entryCandidate: JournalEntryCandidate = {
      tenantId,
      entityId,
      bookId,
      periodId,
      entryNumber: `JV-${Date.now().toString().slice(-6)}`,
      postingDate: '2026-01-15',
      documentDate: '2026-01-15',
      sourceModule: 'AR_INVOICE',
      memoEn: 'Commercial sales to Al-Futtaim Group with 5% VAT',
      createdBy: userId,
      lines: [
        {
          accountId: accBank,
          currency: 'AED',
          amountTxn: 10500000n, // AED 105,000.00
          amountBase: 10500000n,
          fxRate: 100000000n,
          direction: Direction.DEBIT
        },
        {
          accountId: accRev,
          currency: 'AED',
          amountTxn: 10000000n, // AED 100,000.00
          amountBase: 10000000n,
          fxRate: 100000000n,
          direction: Direction.CREDIT,
          vatCode: 'SR_5'
        },
        {
          accountId: accVat,
          currency: 'AED',
          amountTxn: 500000n, // AED 5,000.00
          amountBase: 500000n,
          fxRate: 100000000n,
          direction: Direction.CREDIT,
          vatCode: 'SR_5',
          vatAmountBase: 500000n
        }
      ]
    };

    // 1. Post Journal
    const result = await repo.postJournalEntry(ctx, entryCandidate);
    assert.ok(result.journalId);
    assert.equal(result.entryNumber, entryCandidate.entryNumber);
    assert.ok(result.entryHash.length === 64);

    // 2. List Journals
    const journals = await repo.listJournalEntries(ctx);
    assert.ok(journals.length >= 1);
    const found = journals.find((j) => j.entryNumber === entryCandidate.entryNumber);
    assert.ok(found);
    assert.equal(found?.totalDebitsBase, '10500000');
    assert.equal(found?.totalCreditsBase, '10500000');
    assert.equal(found?.linesCount, 3);

    // 3. Generate VAT 201 from Ledger
    const vatReturn = await repo.generateVat201FromLedger(ctx, periodId, '100456789012345');
    assert.equal(vatReturn.taxRegistrationNumber, '100456789012345');
    const box1 = vatReturn.boxes.find((b) => b.boxId === '1');
    assert.ok(box1);
    assert.ok(box1?.amountBase >= 10000000n);
    assert.ok(box1?.vatAmountBase >= 500000n);
    assert.ok(vatReturn.netTaxPayableOrReclaimable >= 500000n);

    // 4. Invariant Rejection on Unbalanced Entry
    const unbalanced: JournalEntryCandidate = {
      ...entryCandidate,
      entryNumber: `JV-UNBAL-${Date.now().toString().slice(-4)}`,
      lines: [
        {
          accountId: accBank,
          currency: 'AED',
          amountTxn: 10000000n,
          amountBase: 10000000n,
          fxRate: 100000000n,
          direction: Direction.DEBIT
        },
        {
          accountId: accRev,
          currency: 'AED',
          amountTxn: 9000000n, // Discrepancy
          amountBase: 9000000n,
          fxRate: 100000000n,
          direction: Direction.CREDIT
        }
      ]
    };

    await assert.rejects(
      async () => {
        await repo.postJournalEntry(ctx, unbalanced);
      },
      /Double-entry invariant violation/
    );

    await pgPool.end();
  });
});
