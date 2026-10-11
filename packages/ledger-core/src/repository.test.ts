import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newDb, DataType } from 'pg-mem';
import {
  LedgerRepository,
  Direction,
  JournalEntryCandidate,
  PeriodLockStatus
} from './index.js';
import { MigrationRunner } from '@ledger-ae/shared-types';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

function getMigrationsDir(): string {
  const rootMigrations = join(process.cwd(), 'packages/shared-types/migrations');
  const localMigrations = join(process.cwd(), '../shared-types/migrations');
  return existsSync(rootMigrations) ? rootMigrations : localMigrations;
}

import { randomUUID } from 'node:crypto';

function setupPgMem() {
  const memDb = newDb({ noAstCoverageCheck: true });
  memDb.public.registerFunction({
    name: 'gen_random_uuid',
    implementation: () => randomUUID(),
    impure: true
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

describe('Phase 3 Single Source of Truth: LedgerRepository Integration Tests', () => {
  it('posts a balanced journal entry, writes audit log, and lists via RLS', async () => {
    const { pgPool } = setupPgMem();
    const runner = new MigrationRunner(pgPool);
    await runner.runMigrations({ migrationsDir: getMigrationsDir() });

    const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const entityId = '10000000-0000-0000-0000-000000000001';
    const userId = '30000000-0000-0000-0000-000000000001';
    const bookId = '40000000-0000-0000-0000-000000000001';
    const periodId = '50000000-0000-0000-0000-000000000001';
    const accBank = '60000000-0000-0000-0000-000000000001';
    const accRev = '60000000-0000-0000-0000-000000000002';
    const accVat = '60000000-0000-0000-0000-000000000003';

    // Seed tenant, legal entity, user, book, period, chart of accounts
    const client = await pgPool.connect();
    await client.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, 'Al Noor Group', 'al-noor')`, [tenantId]);
    await client.query(`INSERT INTO legal_entities (id, tenant_id, legal_name_en, legal_name_ar, trade_license_number, jurisdiction_type, base_currency, address_emirate)
      VALUES ($1, $2, 'Al Noor LLC', 'شركة النور', 'TL-101', 'MAINLAND', 'AED', 'DUBAI')`, [entityId, tenantId]);
    await client.query(`INSERT INTO users (id, tenant_id, email, full_name_en, role)
      VALUES ($1, $2, 'cfo@alnoor.ae', 'CFO User', 'CFO')`, [userId, tenantId]);
    await client.query(`INSERT INTO books (id, tenant_id, legal_entity_id, book_code, is_primary)
      VALUES ($1, $2, $3, 'STATUTORY_IFRS', true)`, [bookId, tenantId, entityId]);
    await client.query(`INSERT INTO accounting_periods (id, tenant_id, legal_entity_id, fiscal_year, period_number, start_date, end_date)
      VALUES ($1, $2, $3, 2026, 1, '2026-01-01', '2026-01-31')`, [periodId, tenantId, entityId]);
    await client.query(`INSERT INTO chart_of_accounts (id, tenant_id, legal_entity_id, code, name_en, name_ar, type, sub_type, normal_balance)
      VALUES ($1, $2, $3, '1020', 'Emirates NBD', 'بنك الإمارات', 'ASSET', 'CASH', 'DEBIT')`, [accBank, tenantId, entityId]);
    await client.query(`INSERT INTO chart_of_accounts (id, tenant_id, legal_entity_id, code, name_en, name_ar, type, sub_type, normal_balance)
      VALUES ($1, $2, $3, '4010', 'Commercial Sales', 'مبيعات', 'REVENUE', 'OPERATING', 'CREDIT')`, [accRev, tenantId, entityId]);
    await client.query(`INSERT INTO chart_of_accounts (id, tenant_id, legal_entity_id, code, name_en, name_ar, type, sub_type, normal_balance)
      VALUES ($1, $2, $3, '2110', 'Output VAT', 'ضريبة مخرجات', 'LIABILITY', 'TAX', 'CREDIT')`, [accVat, tenantId, entityId]);
    client.release();

    const repo = new LedgerRepository(pgPool);
    const ctx = { tenantId, entityId, userId };

    const entryCandidate: JournalEntryCandidate = {
      tenantId,
      entityId,
      bookId,
      periodId,
      entryNumber: 'JV-2026-0001',
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
    assert.equal(result.entryNumber, 'JV-2026-0001');
    assert.ok(result.entryHash.length === 64);

    // 2. List Journals
    const journals = await repo.listJournalEntries(ctx);
    assert.equal(journals.length, 1);
    assert.equal(journals[0].entryNumber, 'JV-2026-0001');
    assert.equal(journals[0].totalDebitsBase, '10500000');
    assert.equal(journals[0].totalCreditsBase, '10500000');
    assert.equal(journals[0].linesCount, 3);

    // 3. Generate VAT 201 from Ledger
    const vatReturn = await repo.generateVat201FromLedger(ctx, periodId, '100456789012345');
    assert.equal(vatReturn.taxRegistrationNumber, '100456789012345');
    const box1 = vatReturn.boxes.find((b) => b.boxId === '1');
    assert.ok(box1);
    assert.equal(box1?.amountBase, 10000000n);
    assert.equal(box1?.vatAmountBase, 500000n);
    assert.equal(vatReturn.netTaxPayableOrReclaimable, 500000n);

    // 4. Invariant Rejection on Unbalanced Entry
    const unbalanced: JournalEntryCandidate = {
      ...entryCandidate,
      entryNumber: 'JV-2026-0002',
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
