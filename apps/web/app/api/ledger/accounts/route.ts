import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission, TenantDatabaseSession } from '@ledger-ae/shared-types';
import { getDatabasePool } from '@/lib/db';

export interface AccountItem {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  category: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  balanceMinorUnits: string; // integer fils
  isActive: boolean;
  currency: string;
}

export const GET = withAuth(Permission.LEDGER_READ)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const search = searchParams.get('q')?.toLowerCase();
      const entityIdParam = searchParams.get('entityId');
      const targetEntityId =
        entityIdParam === 'ent-mainland'
          ? '00000000-0000-0000-0000-000000000001'
          : entityIdParam === 'ent-dmcc'
          ? '00000000-0000-0000-0000-000000000002'
          : entityIdParam || session.entityId || '00000000-0000-0000-0000-000000000001';

      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      const accounts = await tenantSession.withTenant(session.tenantId, async (client) => {
        // Query chart of accounts scoped by tenant_id with calculated balances from posted journal lines
        const res = await client.query(
          `SELECT
             c.id,
             c.code,
             c.name_en,
             c.name_ar,
             c.type as category,
             c.is_active,
             COALESCE(
               SUM(
                 CASE
                   WHEN c.normal_balance = 'DEBIT' THEN
                     CASE WHEN l.direction = 'DEBIT' THEN l.amount_base ELSE -l.amount_base END
                   ELSE
                     CASE WHEN l.direction = 'CREDIT' THEN l.amount_base ELSE -l.amount_base END
                 END
               ),
               0
             ) as balance_minor_units
           FROM chart_of_accounts c
           LEFT JOIN journal_lines l ON l.account_id = c.id AND l.tenant_id = c.tenant_id
           WHERE c.tenant_id = $1 AND ($2::uuid IS NULL OR c.legal_entity_id = $2::uuid)
           GROUP BY c.id, c.code, c.name_en, c.name_ar, c.type, c.is_active
           ORDER BY c.code ASC`,
          [session.tenantId, targetEntityId]
        );


        return res.rows.map((row: any): AccountItem => ({
          id: row.id,
          code: row.code,
          nameEn: row.name_en,
          nameAr: row.name_ar,
          category: row.category,
          balanceMinorUnits: row.balance_minor_units.toString(),
          isActive: row.is_active,
          currency: 'AED'
        }));
      });

      let filtered = accounts;
      if (search) {
        filtered = accounts.filter(
          (a) =>
            a.code.includes(search) ||
            a.nameEn.toLowerCase().includes(search) ||
            a.nameAr.includes(search)
        );
      }

      return NextResponse.json({
        accounts: filtered,
        total: filtered.length
      });
    } catch (err: any) {
      return NextResponse.json({ error: 'Database query failed: ' + err.message }, { status: 500 });
    }
  }
);
