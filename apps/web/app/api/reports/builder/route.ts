import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission, TenantDatabaseSession } from '@ledger-ae/shared-types';
import { getDatabasePool } from '@/lib/db';

export const POST = withAuth(Permission.LEDGER_READ)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const body = await request.json();
      const { reportType = 'CUSTOM', categories, dateFrom, dateTo, format = 'JSON' } = body;

      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        let categoryFilterClause = '';
        const params: any[] = [session.tenantId];

        if (Array.isArray(categories) && categories.length > 0) {
          params.push(categories);
          categoryFilterClause = `AND c.type = ANY($${params.length})`;
        }

        const res = await client.query(
          `SELECT
             c.code,
             c.name_en,
             c.name_ar,
             c.type as category,
             COALESCE(SUM(CASE WHEN l.direction = 'DEBIT' THEN l.amount_base ELSE 0 END), 0) as total_debit,
             COALESCE(SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount_base ELSE 0 END), 0) as total_credit
           FROM chart_of_accounts c
           LEFT JOIN journal_lines l ON l.account_id = c.id AND l.tenant_id = c.tenant_id
           WHERE c.tenant_id = $1 ${categoryFilterClause}
           GROUP BY c.code, c.name_en, c.name_ar, c.type
           ORDER BY c.code ASC`,
          params
        );

        let sumDebit = 0n;
        let sumCredit = 0n;

        const rows = res.rows.map((r: any) => {
          const d = BigInt(r.total_debit || 0);
          const c = BigInt(r.total_credit || 0);
          sumDebit += d;
          sumCredit += c;
          return {
            code: r.code,
            nameEn: r.name_en,
            nameAr: r.name_ar,
            category: r.category,
            debitMinorUnits: d.toString(),
            creditMinorUnits: c.toString(),
            netBalanceMinorUnits: (d - c).toString()
          };
        });

        if (format === 'CSV') {
          const formatFils = (fils: bigint) => `${fils / 100n}.${(fils % 100n).toString().padStart(2, '0')}`;
          let csv = 'Code,Account Name (EN),Account Name (AR),Category,Debit (AED),Credit (AED)\n';
          for (const row of rows) {
            const deb = formatFils(BigInt(row.debitMinorUnits));
            const cred = formatFils(BigInt(row.creditMinorUnits));
            csv += `"${row.code}","${row.nameEn}","${row.nameAr}","${row.category}",${deb},${cred}\n`;
          }
          return new NextResponse(csv, {
            headers: {
              'Content-Type': 'text/csv',
              'Content-Disposition': `attachment; filename="report_${reportType.toLowerCase()}_${Date.now()}.csv"`
            }
          });
        }

        return NextResponse.json({
          reportType,
          dateFrom: dateFrom || '2026-01-01',
          dateTo: dateTo || '2026-12-31',
          rows,
          summary: {
            totalDebitMinorUnits: sumDebit.toString(),
            totalCreditMinorUnits: sumCredit.toString(),
            isBalanced: sumDebit === sumCredit,
            varianceFils: (sumDebit - sumCredit).toString()
          }
        });
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: 'Report generation failed: ' + err.message, code: 'DB_ERROR' },
        { status: 500 }
      );
    }
  }
);
