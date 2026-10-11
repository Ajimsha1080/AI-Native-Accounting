import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission, TenantDatabaseSession } from '@ledger-ae/shared-types';
import { getDatabasePool } from '@/lib/db';

export const GET = withAuth(Permission.LEDGER_READ)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const type = (searchParams.get('type') || 'TRIAL_BALANCE') as 'TRIAL_BALANCE' | 'PNL' | 'BALANCE_SHEET' | 'CONSOLIDATION';

      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        // Query trial balance from chart_of_accounts joined with journal_lines
        const tbRes = await client.query(
          `SELECT
             c.code as "accountCode",
             c.name_en as "nameEn",
             c.name_ar as "nameAr",
             c.type as category,
             COALESCE(SUM(CASE WHEN l.direction = 'DEBIT' THEN l.amount_base ELSE 0 END), 0) as debits,
             COALESCE(SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount_base ELSE 0 END), 0) as credits
           FROM chart_of_accounts c
           LEFT JOIN journal_lines l ON l.account_id = c.id AND l.tenant_id = c.tenant_id
           WHERE c.tenant_id = $1 AND c.legal_entity_id = $2
           GROUP BY c.code, c.name_en, c.name_ar, c.type
           ORDER BY c.code ASC`,
          [session.tenantId, session.entityId]
        );

        let totalDebit = 0n;
        let totalCredit = 0n;
        const lines = tbRes.rows.map((r: any) => {
          const d = BigInt(r.debits);
          const c = BigInt(r.credits);
          totalDebit += d;
          totalCredit += c;
          const net = d - c;
          return {
            accountCode: r.accountCode,
            nameEn: r.nameEn,
            nameAr: r.nameAr,
            category: r.category,
            debitMinorUnits: d.toString(),
            creditMinorUnits: c.toString(),
            netBalanceMinorUnits: net.toString()
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
      return NextResponse.json({ error: 'Database query failed: ' + err.message }, { status: 500 });
    }
  }
);
