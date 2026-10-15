import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import {
  LedgerRepository,
  Direction,
  JournalEntryCandidate,
  PeriodLockedException,
  PeriodLockStatus
} from './index.js';
import { TenantDatabaseSession } from '@ledger-ae/shared-types';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://ledger_app:ledger_app_secure_pass@localhost:9527/ledger_ae_test';

describe('Phase 1 Data-Integrity Honesty: Journal Posting Integrity (Real Postgres)', () => {
  const pgPool = new Pool({ connectionString: TEST_DATABASE_URL });
  const tenantSession = new TenantDatabaseSession(pgPool);
  const repo = new LedgerRepository(pgPool);

  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';
  const entityA = '11111111-1111-1111-1111-000000000001';
  const entityB = '22222222-2222-2222-2222-000000000001';
  const userA = '11111111-1111-1111-1111-000000000002';
  const userB = '22222222-2222-2222-2222-000000000002';
  const bookA = '11111111-1111-1111-1111-000000000003';
  const bookB = '22222222-2222-2222-2222-000000000003';
  const openPeriodA = '11111111-1111-1111-1111-000000000004';
  const lockedPeriodA = '11111111-1111-1111-1111-000000000005';
  const accA1 = '11111111-1111-1111-1111-000000000006';
  const accA2 = '11111111-1111-1111-1111-000000000007';
  const accB1 = '22222222-2222-2222-2222-000000000006';

  before(async () => {
    // Seed fixtures for Tenant A
    await tenantSession.withTenant(tenantA, async (client) => {
      await client.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, 'Tenant A', 'tenant-a-test') ON CONFLICT (id) DO NOTHING`, [tenantA]);
      await client.query(`INSERT INTO legal_entities (id, tenant_id, legal_name_en, legal_name_ar, trade_license_number, jurisdiction_type, base_currency, address_emirate)
        VALUES ($1, $2, 'Entity A LLC', 'كيان أ', 'TL-A1', 'MAINLAND', 'AED', 'DUBAI') ON CONFLICT (id) DO NOTHING`, [entityA, tenantA]);
      await client.query(`INSERT INTO users (id, tenant_id, email, full_name_en, role)
        VALUES ($1, $2, 'cfo@tenanta.ae', 'CFO A', 'CFO') ON CONFLICT (id) DO NOTHING`, [userA, tenantA]);
      await client.query(`INSERT INTO books (id, tenant_id, legal_entity_id, book_code, currency, is_primary)
        VALUES ($1, $2, $3, 'STATUTORY_IFRS', 'AED', true) ON CONFLICT (id) DO NOTHING`, [bookA, tenantA, entityA]);
      await client.query(`INSERT INTO accounting_periods (id, tenant_id, legal_entity_id, fiscal_year, period_number, start_date, end_date, is_hard_locked)
        VALUES ($1, $2, $3, 2026, 1, '2026-01-01', '2026-01-31', false) ON CONFLICT (id) DO NOTHING`, [openPeriodA, tenantA, entityA]);
      await client.query(`INSERT INTO accounting_periods (id, tenant_id, legal_entity_id, fiscal_year, period_number, start_date, end_date, is_hard_locked)
        VALUES ($1, $2, $3, 2025, 12, '2025-12-01', '2025-12-31', true) ON CONFLICT (id) DO NOTHING`, [lockedPeriodA, tenantA, entityA]);
      await client.query(`INSERT INTO chart_of_accounts (id, tenant_id, legal_entity_id, code, name_en, name_ar, type, sub_type, normal_balance)
        VALUES ($1, $2, $3, '1020', 'Bank Operating', 'بنك', 'ASSET', 'CASH', 'DEBIT') ON CONFLICT (id) DO NOTHING`, [accA1, tenantA, entityA]);
      await client.query(`INSERT INTO chart_of_accounts (id, tenant_id, legal_entity_id, code, name_en, name_ar, type, sub_type, normal_balance)
        VALUES ($1, $2, $3, '4010', 'Revenue', 'إيرادات', 'REVENUE', 'OPERATING', 'CREDIT') ON CONFLICT (id) DO NOTHING`, [accA2, tenantA, entityA]);
    });

    // Seed fixtures for Tenant B
    await tenantSession.withTenant(tenantB, async (client) => {
      await client.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, 'Tenant B', 'tenant-b-test') ON CONFLICT (id) DO NOTHING`, [tenantB]);
      await client.query(`INSERT INTO legal_entities (id, tenant_id, legal_name_en, legal_name_ar, trade_license_number, jurisdiction_type, base_currency, address_emirate)
        VALUES ($1, $2, 'Entity B LLC', 'كيان ب', 'TL-B1', 'MAINLAND', 'AED', 'DUBAI') ON CONFLICT (id) DO NOTHING`, [entityB, tenantB]);
      await client.query(`INSERT INTO users (id, tenant_id, email, full_name_en, role)
        VALUES ($1, $2, 'cfo@tenantb.ae', 'CFO B', 'CFO') ON CONFLICT (id) DO NOTHING`, [userB, tenantB]);
      await client.query(`INSERT INTO books (id, tenant_id, legal_entity_id, book_code, currency, is_primary)
        VALUES ($1, $2, $3, 'STATUTORY_IFRS', 'AED', true) ON CONFLICT (id) DO NOTHING`, [bookB, tenantB, entityB]);
      await client.query(`INSERT INTO chart_of_accounts (id, tenant_id, legal_entity_id, code, name_en, name_ar, type, sub_type, normal_balance)
        VALUES ($1, $2, $3, '1020', 'Bank Operating B', 'بنك ب', 'ASSET', 'CASH', 'DEBIT') ON CONFLICT (id) DO NOTHING`, [accB1, tenantB, entityB]);
    });
  });

  after(async () => {
    await pgPool.end();
  });

  it('1. FK Violation: Fails atomically, rolls back, and persists nothing', async () => {
    const entryNumber = `JV-FK-FAIL-${Date.now()}`;
    const nonExistentAccount = '99999999-9999-9999-9999-999999999999';

    const candidate: JournalEntryCandidate = {
      tenantId: tenantA,
      entityId: entityA,
      createdBy: userA,
      bookId: bookA,
      periodId: openPeriodA,
      entryNumber,
      postingDate: '2026-01-15',
      documentDate: '2026-01-15',
      sourceModule: 'GENERAL_LEDGER',
      memoEn: 'FK Violation test entry',
      lines: [
        {
          accountId: accA1,
          currency: 'AED',
          amountTxn: 500000n,
          amountBase: 500000n,
          fxRate: 100000000n,
          direction: Direction.DEBIT
        },
        {
          accountId: nonExistentAccount,
          currency: 'AED',
          amountTxn: 500000n,
          amountBase: 500000n,
          fxRate: 100000000n,
          direction: Direction.CREDIT
        }
      ]
    };

    await assert.rejects(
      async () => {
        await repo.postJournalEntry({ tenantId: tenantA, entityId: entityA, userId: userA }, candidate);
      },
      (err: any) => {
        assert.ok(err.message.includes('Foreign key') || err.message.includes('not exist') || err.code === '23503');
        return true;
      }
    );

    // Verify nothing was persisted in database (header, lines, audit log)
    const client = await pgPool.connect();
    try {
      const entryRes = await client.query('SELECT * FROM journal_entries WHERE entry_number = $1', [entryNumber]);
      assert.equal(entryRes.rows.length, 0, 'No journal entry header should be persisted');

      const auditRes = await client.query('SELECT * FROM audit_logs WHERE resource_type = $1 AND resource_id = $2', ['journal_entries', entryNumber]);
      assert.equal(auditRes.rows.length, 0, 'No audit log should be persisted on rollback');
    } finally {
      client.release();
    }
  });

  it('2. Locked Period: Fails with PeriodLockedException, rolls back, and persists nothing', async () => {
    const entryNumber = `JV-LOCKED-FAIL-${Date.now()}`;

    const candidate: JournalEntryCandidate = {
      tenantId: tenantA,
      entityId: entityA,
      createdBy: userA,
      bookId: bookA,
      periodId: lockedPeriodA, // HARD_LOCKED period
      entryNumber,
      postingDate: '2025-12-15',
      documentDate: '2025-12-15',
      sourceModule: 'GENERAL_LEDGER',
      memoEn: 'Locked period test entry',
      lines: [
        {
          accountId: accA1,
          currency: 'AED',
          amountTxn: 1000000n,
          amountBase: 1000000n,
          fxRate: 100000000n,
          direction: Direction.DEBIT
        },
        {
          accountId: accA2,
          currency: 'AED',
          amountTxn: 1000000n,
          amountBase: 1000000n,
          fxRate: 100000000n,
          direction: Direction.CREDIT
        }
      ]
    };

    await assert.rejects(
      async () => {
        await repo.postJournalEntry({ tenantId: tenantA, entityId: entityA, userId: userA }, candidate);
      },
      (err: any) => {
        assert.ok(err instanceof PeriodLockedException || err.status === PeriodLockStatus.HARD_LOCKED || err.message.includes('HARD_LOCKED'));
        return true;
      }
    );

    // Verify nothing was persisted
    const client = await pgPool.connect();
    try {
      const entryRes = await client.query('SELECT * FROM journal_entries WHERE entry_number = $1', [entryNumber]);
      assert.equal(entryRes.rows.length, 0, 'No journal entry should be persisted for locked period');
    } finally {
      client.release();
    }
  });

  it('3. Unbalanced Entry: Fails double-entry validation, persists nothing', async () => {
    const entryNumber = `JV-UNBAL-FAIL-${Date.now()}`;

    const candidate: JournalEntryCandidate = {
      tenantId: tenantA,
      entityId: entityA,
      createdBy: userA,
      bookId: bookA,
      periodId: openPeriodA,
      entryNumber,
      postingDate: '2026-01-15',
      documentDate: '2026-01-15',
      sourceModule: 'GENERAL_LEDGER',
      memoEn: 'Unbalanced entry test',
      lines: [
        {
          accountId: accA1,
          currency: 'AED',
          amountTxn: 5000000n, // AED 50,000.00
          amountBase: 5000000n,
          fxRate: 100000000n,
          direction: Direction.DEBIT
        },
        {
          accountId: accA2,
          currency: 'AED',
          amountTxn: 4999900n, // Discrepancy of 100 fils
          amountBase: 4999900n,
          fxRate: 100000000n,
          direction: Direction.CREDIT
        }
      ]
    };

    await assert.rejects(
      async () => {
        await repo.postJournalEntry({ tenantId: tenantA, entityId: entityA, userId: userA }, candidate);
      },
      (err: any) => {
        assert.ok(err.message.includes('Double-entry invariant violation') || err.message.includes('variance'));
        return true;
      }
    );

    // Verify nothing was persisted
    const client = await pgPool.connect();
    try {
      const entryRes = await client.query('SELECT * FROM journal_entries WHERE entry_number = $1', [entryNumber]);
      assert.equal(entryRes.rows.length, 0, 'No journal entry should be persisted for unbalanced entry');
    } finally {
      client.release();
    }
  });

  it('4. Cross-Tenant Attempt: Fails RLS / cross-tenant check, persists nothing', async () => {
    const entryNumber = `JV-X-TENANT-FAIL-${Date.now()}`;

    // Tenant A tries to post a line referencing Tenant B's account
    const candidate: JournalEntryCandidate = {
      tenantId: tenantA,
      entityId: entityA,
      createdBy: userA,
      bookId: bookA,
      periodId: openPeriodA,
      entryNumber,
      postingDate: '2026-01-15',
      documentDate: '2026-01-15',
      sourceModule: 'GENERAL_LEDGER',
      memoEn: 'Cross-tenant account infiltration attempt',
      lines: [
        {
          accountId: accA1,
          currency: 'AED',
          amountTxn: 1000000n,
          amountBase: 1000000n,
          fxRate: 100000000n,
          direction: Direction.DEBIT
        },
        {
          accountId: accB1, // Belongs to Tenant B!
          currency: 'AED',
          amountTxn: 1000000n,
          amountBase: 1000000n,
          fxRate: 100000000n,
          direction: Direction.CREDIT
        }
      ]
    };

    await assert.rejects(
      async () => {
        await repo.postJournalEntry({ tenantId: tenantA, entityId: entityA, userId: userA }, candidate);
      },
      (err: any) => {
        assert.ok(err.message.includes('cross-tenant') || err.message.includes('Foreign key') || err.message.includes('violates') || err.code === '42501');
        return true;
      }
    );

    // Verify nothing was persisted in either tenant
    const client = await pgPool.connect();
    try {
      const entryRes = await client.query('SELECT * FROM journal_entries WHERE entry_number = $1', [entryNumber]);
      assert.equal(entryRes.rows.length, 0, 'No journal entry should be persisted for cross-tenant attempt');
    } finally {
      client.release();
    }
  });
});
