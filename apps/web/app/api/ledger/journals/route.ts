import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission } from '@ledger-ae/shared-types';
import { LedgerRepository, JournalEntryCandidate, Direction } from '@ledger-ae/ledger-core';
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

      return NextResponse.json({
        journals,
        total: journals.length
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: `Database query failed: ${err.message}` },
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
          return NextResponse.json({ error: 'Missing journalId to reverse' }, { status: 400 });
        }

        // Fetch original journal within tenant session
        const existingEntries = await repo.listJournalEntries(ctx);
        const target = existingEntries.find((j) => j.id === journalId);
        if (!target) {
          return NextResponse.json({ error: 'Target journal not found' }, { status: 404 });
        }

        // Query lines to build reversal
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
          bookId: body.bookId || target.periodId, // defaults to book associated with period
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

      // Standard Journal Voucher Posting (POST)
      if (!journal || !journal.lines || journal.lines.length < 2) {
        return NextResponse.json(
          { error: 'A journal voucher must contain at least 2 double-entry lines' },
          { status: 400 }
        );
      }

      const candidate: JournalEntryCandidate = {
        tenantId: session.tenantId,
        entityId: session.entityId,
        createdBy: session.userId,
        bookId: journal.bookId,
        periodId: journal.periodId,
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
          return {
            accountId: l.accountId,
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

      const result = await repo.postJournalEntry(ctx, candidate);
      return NextResponse.json({ success: true, journal: result, isBalanced: true });
    } catch (err: any) {
      return NextResponse.json({ error: 'Server error processing journal: ' + err.message }, { status: 500 });
    }
  }
);
