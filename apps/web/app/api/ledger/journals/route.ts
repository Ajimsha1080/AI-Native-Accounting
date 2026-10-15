import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission } from '@ledger-ae/shared-types';
import { LedgerRepository, JournalEntryCandidate, Direction, PeriodLockedException } from '@ledger-ae/ledger-core';
import { getDatabasePool } from '@/lib/db';

export const GET = withAuth(Permission.LEDGER_READ)(
  async (_req: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const pool = getDatabasePool();
      const repo = new LedgerRepository(pool);
      const journals = await repo.listJournalEntries({
        tenantId: session.tenantId,
        entityId: session.entityId,
        userId: session.userId
      });

      const formattedJournals = journals.map((j) => ({
        id: j.id,
        voucherNumber: j.entryNumber,
        date: j.postingDate,
        period: 'FY2026-P01',
        status: j.status,
        description: j.memoEn || 'Journal Entry',
        totalDebitMinorUnits: j.totalDebitsBase,
        totalCreditMinorUnits: j.totalCreditsBase,
        lines: [] as any[]
      }));

      return NextResponse.json({
        journals: formattedJournals,
        total: formattedJournals.length
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: `Database query failed: ${err.message}`, code: 'DB_ERROR' },
        { status: 500 }
      );
    }
  }
);

export const POST = withAuth(Permission.LEDGER_POST)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const body = await request.json();
      const { action, journal } = body;
      const pool = getDatabasePool();
      const repo = new LedgerRepository(pool);

      const ctx = {
        tenantId: session.tenantId,
        entityId: session.entityId,
        userId: session.userId
      };

      if (action === 'REVERSE') {
        const { journalId } = body;
        if (!journalId) {
          return NextResponse.json({ error: 'Missing journalId to reverse', code: 'INVALID_INPUT' }, { status: 400 });
        }

        const existingEntries = await repo.listJournalEntries(ctx);
        const target = existingEntries.find((j) => j.id === journalId);
        if (!target) {
          return NextResponse.json({ error: 'Target journal not found', code: 'NOT_FOUND' }, { status: 404 });
        }

        const linesRes = await pool.query(
          `SELECT account_id, currency, amount_txn, amount_base, fx_rate, direction, vat_code, vat_rate_bps, vat_amount_base
           FROM journal_lines WHERE journal_entry_id = $1 AND tenant_id = $2 ORDER BY line_order ASC`,
          [journalId, session.tenantId]
        );

        const revLines = linesRes.rows.map((l: any) => ({
          accountId: l.account_id,
          currency: l.currency,
          amountTxn: BigInt(l.amount_txn),
          amountBase: BigInt(l.amount_base),
          fxRate: BigInt(l.fx_rate),
          direction: l.direction === Direction.DEBIT ? Direction.CREDIT : Direction.DEBIT,
          vatCode: l.vat_code || undefined,
          vatRateBps: l.vat_rate_bps || undefined,
          vatAmountBase: l.vat_amount_base ? BigInt(l.vat_amount_base) : undefined
        }));

        const reversalCandidate: JournalEntryCandidate = {
          tenantId: session.tenantId,
          entityId: session.entityId,
          createdBy: session.userId,
          bookId: body.bookId || target.periodId,
          periodId: target.periodId,
          entryNumber: `REV-${target.entryNumber}-${Date.now().toString().slice(-4)}`,
          postingDate: new Date().toISOString().split('T')[0],
          documentDate: new Date().toISOString().split('T')[0],
          sourceModule: 'GENERAL_LEDGER',
          memoEn: `Reversal of voucher ${target.entryNumber}: ${target.memoEn}`,
          lines: revLines
        };

        const result = await repo.postJournalEntry(ctx, reversalCandidate);
        return NextResponse.json({ success: true, journal: result });
      }

      // Check cross-tenant payload attempt
      if (journal && journal.tenantId && journal.tenantId !== session.tenantId) {
        return NextResponse.json(
          { error: 'Cannot post journal entries for a different tenant', code: 'CROSS_TENANT_VIOLATION' },
          { status: 403 }
        );
      }

      // Standard Journal Voucher Handling
      if (!journal || !journal.lines || journal.lines.length < 2) {
        return NextResponse.json(
          { error: 'A journal voucher must contain at least 2 double-entry lines', code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }

      // Check balance invariant in integer minor units
      const totalDebits = journal.lines.reduce((acc: bigint, l: any) => acc + BigInt(l.debitMinorUnits || '0'), 0n);
      const totalCredits = journal.lines.reduce((acc: bigint, l: any) => acc + BigInt(l.creditMinorUnits || '0'), 0n);
      const isBalanced = totalDebits > 0n && totalDebits === totalCredits;

      if (!isBalanced) {
        return NextResponse.json(
          { error: `Journal is out of balance. Debits: ${totalDebits}, Credits: ${totalCredits}`, code: 'UNBALANCED_ENTRY' },
          { status: 400 }
        );
      }

      if (action === 'VALIDATE') {
        return NextResponse.json({
          success: true,
          isBalanced: true,
          varianceFils: '0',
          message: 'Double-entry invariant verified: 0 fils variance.'
        });
      }

      // Resolve default bookId and periodId if missing
      let bookId = journal.bookId;
      let periodId = journal.periodId;

      if (!bookId || !periodId) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [session.tenantId]);
          if (!bookId) {
            const bRes = await client.query('SELECT id FROM books WHERE tenant_id = $1 LIMIT 1', [session.tenantId]);
            if (bRes.rows.length > 0) bookId = bRes.rows[0].id;
          }
          if (!periodId) {
            const pRes = await client.query('SELECT id FROM accounting_periods WHERE tenant_id = $1 AND is_hard_locked = false ORDER BY period_number ASC LIMIT 1', [session.tenantId]);
            if (pRes.rows.length > 0) periodId = pRes.rows[0].id;
          }
          await client.query('COMMIT');
        } catch {
          await client.query('ROLLBACK');
        } finally {
          client.release();
        }
      }

      if (!bookId) {
        return NextResponse.json(
          { error: 'No accounting book found for tenant', code: 'FK_VIOLATION' },
          { status: 400 }
        );
      }

      if (!periodId) {
        return NextResponse.json(
          { error: 'No open accounting period found for tenant', code: 'PERIOD_NOT_FOUND' },
          { status: 400 }
        );
      }

      // Resolve account IDs for tenant
      const accListRes = await pool.query(
        `SELECT id, code FROM chart_of_accounts WHERE tenant_id = $1`,
        [session.tenantId]
      );
      const accMap = new Map<string, string>();
      for (const row of accListRes.rows) {
        accMap.set(row.id, row.id);
        accMap.set(row.code, row.id);
        accMap.set(`acc-${row.code}`, row.id);
      }

      const candidate: JournalEntryCandidate = {
        tenantId: session.tenantId,
        entityId: session.entityId,
        createdBy: session.userId,
        bookId,
        periodId,
        entryNumber: journal.voucherNumber || `JV-${Date.now().toString().slice(-6)}`,
        postingDate: journal.date || new Date().toISOString().split('T')[0],
        documentDate: journal.date || new Date().toISOString().split('T')[0],
        sourceModule: 'GENERAL_LEDGER',
        memoEn: journal.description || 'General Journal Voucher',
        lines: journal.lines.map((l: any) => {
          const debit = BigInt(l.debitMinorUnits || '0');
          const credit = BigInt(l.creditMinorUnits || '0');
          const isDebit = debit > 0n;
          const amount = isDebit ? debit : credit;
          const resolvedAccountId = accMap.get(l.accountId) || accMap.get(l.accountCode) || l.accountId;

          return {
            accountId: resolvedAccountId,
            currency: l.currency || 'AED',
            amountTxn: amount,
            amountBase: amount,
            fxRate: 100000000n, // 1.00000000
            direction: isDebit ? Direction.DEBIT : Direction.CREDIT,
            vatCode: l.vatCode || undefined,
            vatRateBps: l.vatRateBps || undefined,
            vatAmountBase: l.vatAmountBase ? BigInt(l.vatAmountBase) : undefined
          };
        })
      };

      try {
        const result = await repo.postJournalEntry(ctx, candidate);
        return NextResponse.json({ success: true, journal: result, isBalanced: true }, { status: 201 });
      } catch (err: any) {
        if (
          err instanceof PeriodLockedException ||
          err.name === 'PeriodLockedException' ||
          err.message?.includes('HARD_LOCKED') ||
          err.message?.includes('SOFT_LOCKED') ||
          err.message?.includes('is locked')
        ) {
          return NextResponse.json(
            { error: err.message, code: 'PERIOD_LOCKED' },
            { status: 400 }
          );
        }
        if (
          err.message?.includes('Double-entry invariant violation') ||
          err.message?.includes('out of balance')
        ) {
          return NextResponse.json(
            { error: err.message, code: 'UNBALANCED_ENTRY' },
            { status: 400 }
          );
        }
        if (
          err.message?.includes('Cross-tenant') ||
          err.code === '42501'
        ) {
          return NextResponse.json(
            { error: err.message || 'Cross-tenant access forbidden', code: 'CROSS_TENANT_VIOLATION' },
            { status: 403 }
          );
        }
        if (
          err.code === '23503' ||
          err.code === '22P02' ||
          err.message?.includes('Foreign key') ||
          err.message?.includes('violates foreign key') ||
          err.message?.includes('not found')
        ) {
          return NextResponse.json(
            { error: err.message, code: 'FK_VIOLATION' },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: `Database error: ${err.message}`, code: 'DB_ERROR' },
          { status: 500 }
        );
      }
    } catch (err: any) {
      return NextResponse.json({ error: 'Server error processing journal: ' + err.message, code: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
    }
  }
);
