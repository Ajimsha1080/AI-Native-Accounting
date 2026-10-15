import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission, TenantDatabaseSession } from '@ledger-ae/shared-types';
import { getDatabasePool } from '@/lib/db';

export const GET = withAuth(Permission.LEDGER_READ)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        // Query legal entities and their multi-book balances
        const entitiesRes = await client.query(
          `SELECT
             e.id as "entityId",
             e.legal_name_en as "nameEn",
             e.legal_name_ar as "nameAr",
             e.base_currency as currency,
             e.jurisdiction_type as "jurisdictionType",
             COALESCE(SUM(CASE WHEN l.direction = 'DEBIT' THEN l.amount_base ELSE 0 END), 0) as total_debit,
             COALESCE(SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount_base ELSE 0 END), 0) as total_credit
           FROM legal_entities e
           LEFT JOIN journal_entries j ON j.legal_entity_id = e.id AND j.tenant_id = e.tenant_id
           LEFT JOIN journal_lines l ON l.journal_entry_id = j.id AND l.tenant_id = e.tenant_id
           WHERE e.tenant_id = $1
           GROUP BY e.id, e.legal_name_en, e.legal_name_ar, e.base_currency, e.jurisdiction_type
           ORDER BY e.created_at ASC`,
          [session.tenantId]
        );

        // Intercompany clearing lines
        const clearingRes = await client.query(
          `SELECT
             c.code,
             c.name_en,
             COALESCE(SUM(CASE WHEN l.direction = 'DEBIT' THEN l.amount_base ELSE 0 END), 0) as clearing_debit,
             COALESCE(SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount_base ELSE 0 END), 0) as clearing_credit
           FROM chart_of_accounts c
           LEFT JOIN journal_lines l ON l.account_id = c.id AND l.tenant_id = c.tenant_id
           WHERE c.tenant_id = $1 AND c.code = '3300'
           GROUP BY c.code, c.name_en`,
          [session.tenantId]
        );

        const clearingRow = clearingRes.rows[0] || { clearing_debit: 0, clearing_credit: 0 };
        const clearingDebit = BigInt(clearingRow.clearing_debit || 0);
        const clearingCredit = BigInt(clearingRow.clearing_credit || 0);

        return NextResponse.json({
          frameworks: [
            { id: 'IFRS_10_CONSOLIDATED', name: 'IFRS 10 Consolidated Group Financials', standard: 'IFRS', status: 'BALANCED' },
            { id: 'UAE_STATUTORY_TAX', name: 'UAE Corporate Tax Statutory Book (FDL 47)', standard: 'LOCAL_GAAP', status: 'ACTIVE' },
            { id: 'MANAGEMENT_SECONDARY', name: 'Management Internal Book (Multi-Currency)', standard: 'INTERNAL', status: 'ACTIVE' }
          ],
          entities: entitiesRes.rows.map((row: any) => ({
            entityId: row.entityId,
            nameEn: row.nameEn,
            nameAr: row.nameAr,
            currency: row.currency,
            jurisdiction: row.jurisdictionType,
            totalDebitMinorUnits: row.total_debit.toString(),
            totalCreditMinorUnits: row.total_credit.toString(),
            netBalanceMinorUnits: (BigInt(row.total_debit) - BigInt(row.total_credit)).toString()
          })),
          intercompanyElimination: {
            accountCode: '3300',
            clearingDebitMinorUnits: clearingDebit.toString(),
            clearingCreditMinorUnits: clearingCredit.toString(),
            isEliminated: clearingDebit === clearingCredit,
            eliminationFils: (clearingDebit - clearingCredit).toString()
          }
        });
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: 'Database query failed: ' + err.message, code: 'DB_ERROR' },
        { status: 500 }
      );
    }
  }
);
