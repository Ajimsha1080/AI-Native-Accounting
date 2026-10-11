import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission, TenantDatabaseSession } from '@ledger-ae/shared-types';
import { getDatabasePool } from '@/lib/db';

export const GET = withAuth(Permission.BANK_RECONCILE)(
  async (_req: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        // Query bank statement lines
        const stmtRes = await client.query(
          `SELECT id, value_date as date, reference, description, amount_base as "amountMinorUnits", currency,
                  reconciliation_status as "matchedStatus", matched_journal_line_id as "matchedLedgerEntryId"
           FROM bank_statement_lines
           WHERE tenant_id = $1
           ORDER BY value_date DESC`,
          [session.tenantId]
        );

        // Query ledger lines for cash/bank accounts
        const ledgerRes = await client.query(
          `SELECT l.id, j.entry_number as "voucherNumber", j.posting_date as date, j.memo_en as description,
                  l.amount_base as "amountMinorUnits", c.code as "accountCode", (l.reconciled_at IS NOT NULL) as "isReconciled"
           FROM journal_lines l
           JOIN journal_entries j ON j.id = l.journal_entry_id
           JOIN chart_of_accounts c ON c.id = l.account_id
           WHERE l.tenant_id = $1 AND c.sub_type IN ('CASH', 'BANK')
           ORDER BY j.posting_date DESC`,
          [session.tenantId]
        );

        // Query AI suggestions from ai_proposals
        const aiRes = await client.query(
          `SELECT id, source_document_id as "statementLineId", target_resource_id as "ledgerLineId",
                  confidence_score as confidence, reasoning_summary as "explanationEn", category as "matchType"
           FROM ai_proposals
           WHERE tenant_id = $1 AND category = 'RECONCILIATION' AND status = 'PENDING'
           ORDER BY confidence_score DESC`,
          [session.tenantId]
        );

        const statements = stmtRes.rows;
        const ledgerTransactions = ledgerRes.rows;
        const suggestions = aiRes.rows;

        const bankBalanceMinorUnits = statements.reduce(
          (acc: bigint, l: any) => acc + BigInt(l.amountMinorUnits || '0'),
          0n
        );
        const ledgerBalanceMinorUnits = ledgerTransactions.reduce(
          (acc: bigint, l: any) => acc + BigInt(l.amountMinorUnits || '0'),
          0n
        );
        const differenceMinorUnits = bankBalanceMinorUnits - ledgerBalanceMinorUnits;

        return NextResponse.json({
          accountName: 'Emirates NBD - Operating (AED)',
          iban: 'AE120260000001234567891',
          currency: 'AED',
          bankBalanceMinorUnits: bankBalanceMinorUnits.toString(),
          ledgerBalanceMinorUnits: ledgerBalanceMinorUnits.toString(),
          differenceMinorUnits: differenceMinorUnits.toString(),
          statements,
          ledgerTransactions,
          suggestions
        });
      });
    } catch (err: any) {
      return NextResponse.json({ error: 'Database query failed: ' + err.message }, { status: 500 });
    }
  }
);

export const POST = withAuth(Permission.BANK_RECONCILE)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const body = await request.json();
      const { action, statementLineId, ledgerLineId } = body;
      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        if (action === 'MATCH') {
          // Update statement line
          const stmtRes = await client.query(
            `UPDATE bank_statement_lines
             SET reconciliation_status = 'MATCHED', matched_journal_line_id = $1
             WHERE id = $2 AND tenant_id = $3
             RETURNING *`,
            [ledgerLineId, statementLineId, session.tenantId]
          );

          if (stmtRes.rows.length === 0) {
            return NextResponse.json({ error: 'Statement line not found' }, { status: 404 });
          }

          // Update ledger line
          await client.query(
            `UPDATE journal_lines
             SET reconciled_at = NOW()
             WHERE id = $1 AND tenant_id = $2`,
            [ledgerLineId, session.tenantId]
          );

          return NextResponse.json({ success: true, stmt: stmtRes.rows[0] });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
      });
    } catch (err: any) {
      return NextResponse.json({ error: 'Server error: ' + err.message }, { status: 500 });
    }
  }
);
