import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission, TenantDatabaseSession } from '@ledger-ae/shared-types';
import { getDatabasePool } from '@/lib/db';

export const GET = withAuth(Permission.LEDGER_READ)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const type = searchParams.get('type') || 'TRIAL_BALANCE';

      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        // Query journal lines joined with chart of accounts
        const res = await client.query(
          `SELECT
            c.code as account_code,
            c.name_en,
            c.name_ar,
            c.type as category,
            COALESCE(SUM(CASE WHEN l.direction = 'DEBIT' THEN l.amount_base ELSE 0 END), 0) as total_debit,
            COALESCE(SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount_base ELSE 0 END), 0) as total_credit
           FROM chart_of_accounts c
           LEFT JOIN journal_lines l ON l.account_id = c.id AND l.tenant_id = c.tenant_id
           WHERE c.tenant_id = $1
           GROUP BY c.code, c.name_en, c.name_ar, c.type
           ORDER BY c.code ASC`,
          [session.tenantId]
        );

        let totalDebit = 0n;
        let totalCredit = 0n;

        const lines = res.rows.map((row: any) => {
          const d = BigInt(row.total_debit || 0);
          const c = BigInt(row.total_credit || 0);
          totalDebit += d;
          totalCredit += c;
          return {
            accountCode: row.account_code,
            nameEn: row.name_en,
            nameAr: row.name_ar,
            category: row.category,
            debitMinorUnits: d.toString(),
            creditMinorUnits: c.toString(),
            netBalanceMinorUnits: (d - c).toString()
          };
        });

        const revenueLines = lines.filter((l: any) => l.category === 'REVENUE');
        const expenseLines = lines.filter((l: any) => l.category === 'EXPENSE');
        const assetLines = lines.filter((l: any) => l.category === 'ASSET');
        const liabilityLines = lines.filter((l: any) => l.category === 'LIABILITY');
        const equityLines = lines.filter((l: any) => l.category === 'EQUITY');

        const totalRevenue = revenueLines.reduce((acc: bigint, l: any) => acc + BigInt(l.creditMinorUnits) - BigInt(l.debitMinorUnits), 0n);
        const totalExpense = expenseLines.reduce((acc: bigint, l: any) => acc + BigInt(l.debitMinorUnits) - BigInt(l.creditMinorUnits), 0n);
        const netProfit = totalRevenue - totalExpense;

        const totalAssets = assetLines.reduce((acc: bigint, l: any) => acc + BigInt(l.debitMinorUnits) - BigInt(l.creditMinorUnits), 0n);
        const totalLiabilities = liabilityLines.reduce((acc: bigint, l: any) => acc + BigInt(l.creditMinorUnits) - BigInt(l.debitMinorUnits), 0n);
        const totalEquity = equityLines.reduce((acc: bigint, l: any) => acc + BigInt(l.creditMinorUnits) - BigInt(l.debitMinorUnits), 0n);

        return NextResponse.json({
          reportType: type,
          period: 'FY 2026 - P01 (01 Jan 2026 - 31 Jan 2026)',
          generatedAt: new Date().toISOString(),
          currency: 'AED',
          trialBalance: {
            lines,
            totalDebitMinorUnits: totalDebit.toString(),
            totalCreditMinorUnits: totalCredit.toString(),
            isBalanced: totalDebit === totalCredit,
            varianceFils: (totalDebit - totalCredit).toString()
          },
          pnl: {
            revenueLines,
            expenseLines,
            totalRevenueMinorUnits: totalRevenue.toString(),
            totalExpenseMinorUnits: totalExpense.toString(),
            netProfitMinorUnits: netProfit.toString()
          },
          balanceSheet: {
            assetLines,
            liabilityLines,
            equityLines,
            totalAssetsMinorUnits: totalAssets.toString(),
            totalLiabilitiesAndEquityMinorUnits: (totalLiabilities + totalEquity).toString(),
            isBalanced: totalAssets === (totalLiabilities + totalEquity)
          },
          consolidation: {
            entities: [],
            intercompanyEliminationsMinorUnits: '0',
            consolidatedTotalMinorUnits: totalDebit.toString()
          }
        });
      });
    } catch (err: any) {
      return NextResponse.json({ error: 'Database query failed: ' + err.message, code: 'DB_ERROR' }, { status: 500 });
    }
  }
);
