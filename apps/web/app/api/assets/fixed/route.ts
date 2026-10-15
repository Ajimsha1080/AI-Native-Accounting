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
        const res = await client.query(
          `SELECT
             fa.id,
             fa.asset_number as "assetNumber",
             fa.name_en as "nameEn",
             fa.acquisition_date as "acquisitionDate",
             fa.acquisition_cost_base as "acquisitionCostBase",
             fa.useful_life_months as "usefulLifeMonths",
             fa.salvage_value_base as "salvageValueBase",
             fa.accumulated_depreciation_base as "accumulatedDepreciationBase",
             (fa.acquisition_cost_base - fa.accumulated_depreciation_base) as "netBookValueBase",
             json_agg(
               json_build_object(
                 'id', s.id,
                 'periodDate', s.period_date,
                 'depreciationAmountBase', s.depreciation_amount_base,
                 'accumulatedBase', s.accumulated_depreciation_base,
                 'netBookValueBase', s.net_book_value_base,
                 'isPosted', s.is_posted
               ) ORDER BY s.period_date ASC
             ) FILTER (WHERE s.id IS NOT NULL) as schedules
           FROM fixed_assets fa
           LEFT JOIN fixed_asset_schedules s ON s.asset_id = fa.id AND s.tenant_id = fa.tenant_id
           WHERE fa.tenant_id = $1
           GROUP BY fa.id, fa.asset_number, fa.name_en, fa.acquisition_date, fa.acquisition_cost_base, fa.useful_life_months, fa.salvage_value_base, fa.accumulated_depreciation_base
           ORDER BY fa.asset_number ASC`,
          [session.tenantId]
        );

        return NextResponse.json({
          assets: res.rows.map((row: any) => ({
            id: row.id,
            assetNumber: row.assetNumber,
            nameEn: row.nameEn,
            acquisitionDate: row.acquisitionDate,
            acquisitionCostBase: row.acquisitionCostBase.toString(),
            usefulLifeMonths: row.usefulLifeMonths,
            salvageValueBase: row.salvageValueBase.toString(),
            accumulatedDepreciationBase: row.accumulatedDepreciationBase.toString(),
            netBookValueBase: row.netBookValueBase.toString(),
            schedules: row.schedules || []
          }))
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

export const POST = withAuth(Permission.LEDGER_POST)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const body = await request.json();
      const { assetId, periodDate, amountBase } = body;

      if (!assetId || !amountBase) {
        return NextResponse.json(
          { error: 'Invalid payload: assetId and amountBase required', code: 'INVALID_PAYLOAD' },
          { status: 400 }
        );
      }

      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        const depFils = BigInt(amountBase);

        // 1. Update fixed asset accumulated depreciation
        const assetRes = await client.query(
          `UPDATE fixed_assets
           SET accumulated_depreciation_base = accumulated_depreciation_base + $1
           WHERE id = $2 AND tenant_id = $3
           RETURNING asset_number, accumulated_depreciation_base`,
          [depFils.toString(), assetId, session.tenantId]
        );

        if (assetRes.rows.length === 0) {
          return NextResponse.json(
            { error: 'Asset not found or does not belong to tenant', code: 'NOT_FOUND' },
            { status: 404 }
          );
        }

        // 2. Mark schedule as posted if exists
        await client.query(
          `UPDATE fixed_asset_schedules
           SET is_posted = true
           WHERE asset_id = $1 AND period_date = $2 AND tenant_id = $3`,
          [assetId, periodDate || '2026-02-28', session.tenantId]
        );

        // 3. Write immutable audit log
        await client.query(
          `INSERT INTO audit_logs (tenant_id, entity_id, user_id, role, action, resource_type, resource_id, diff_hash, payload_after)
           VALUES ($1, $2, $3, $4, 'DEPRECIATION_POSTED', 'FIXED_ASSET', $5, 'DEPRECIATION_HASH', $6::jsonb)`,
          [
            session.tenantId,
            session.entityId,
            session.userId,
            session.role,
            assetId,
            JSON.stringify({ assetNumber: assetRes.rows[0].asset_number, amountBase: depFils.toString() })
          ]
        );

        return NextResponse.json({
          success: true,
          assetId,
          assetNumber: assetRes.rows[0].asset_number,
          depreciationAmountBase: depFils.toString(),
          totalAccumulatedBase: assetRes.rows[0].accumulated_depreciation_base.toString()
        });
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: 'Depreciation posting failed: ' + err.message, code: 'DB_ERROR' },
        { status: 500 }
      );
    }
  }
);
