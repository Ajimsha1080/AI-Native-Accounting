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
        // Query IFRS 15 Contracts
        const contractsRes = await client.query(
          `SELECT
             c.id,
             c.contract_number as "contractNumber",
             c.contract_name as "contractName",
             c.start_date as "startDate",
             c.end_date as "endDate",
             c.total_contract_value_base as "totalValueBase",
             c.recognized_revenue_base as "recognizedBase",
             c.deferred_revenue_base as "deferredBase",
             c.status,
             cust.name_en as "customerNameEn",
             cust.name_ar as "customerNameAr",
             json_agg(
               json_build_object(
                 'id', m.id,
                 'milestoneName', m.milestone_name,
                 'milestoneValueBase', m.milestone_value_base,
                 'completionPercentage', m.completion_percentage,
                 'isSatisfied', m.is_satisfied,
                 'satisfiedDate', m.satisfied_date
               ) ORDER BY m.created_at ASC
             ) FILTER (WHERE m.id IS NOT NULL) as milestones
           FROM ifrs15_contracts c
           JOIN customers cust ON cust.id = c.customer_id AND cust.tenant_id = c.tenant_id
           LEFT JOIN ifrs15_milestones m ON m.contract_id = c.id AND m.tenant_id = c.tenant_id
           WHERE c.tenant_id = $1
           GROUP BY c.id, c.contract_number, c.contract_name, c.start_date, c.end_date, c.total_contract_value_base, c.recognized_revenue_base, c.deferred_revenue_base, c.status, cust.name_en, cust.name_ar
           ORDER BY c.contract_number ASC`,
          [session.tenantId]
        );

        // Query IFRS 16 Leases
        const leasesRes = await client.query(
          `SELECT
             l.id,
             l.contract_number as "contractNumber",
             l.commencement_date as "commencementDate",
             l.lease_term_months as "leaseTermMonths",
             l.monthly_payment_base as "monthlyPaymentBase",
             l.annual_discount_rate_bps as "discountRateBps",
             l.rou_asset_initial_base as "rouAssetBase",
             l.lease_liability_initial_base as "leaseLiabilityBase",
             json_agg(
               json_build_object(
                 'id', ls.id,
                 'periodMonth', ls.period_month,
                 'paymentBase', ls.payment_base,
                 'principalBase', ls.principal_base,
                 'interestBase', ls.interest_base,
                 'closingLiabilityBase', ls.closing_liability_base,
                 'rouDepreciationBase', ls.rou_depreciation_base,
                 'isPosted', ls.is_posted
               ) ORDER BY ls.period_month ASC
             ) FILTER (WHERE ls.id IS NOT NULL) as schedules
           FROM lease_contracts l
           LEFT JOIN lease_schedules ls ON ls.contract_id = l.id AND ls.tenant_id = l.tenant_id
           WHERE l.tenant_id = $1
           GROUP BY l.id, l.contract_number, l.commencement_date, l.lease_term_months, l.monthly_payment_base, l.annual_discount_rate_bps, l.rou_asset_initial_base, l.lease_liability_initial_base
           ORDER BY l.contract_number ASC`,
          [session.tenantId]
        );

        return NextResponse.json({
          ifrs15: contractsRes.rows.map((row: any) => ({
            id: row.id,
            contractNumber: row.contractNumber,
            contractName: row.contractName,
            startDate: row.startDate,
            endDate: row.endDate,
            totalValueBase: row.totalValueBase.toString(),
            recognizedBase: row.recognizedBase.toString(),
            deferredBase: row.deferredBase.toString(),
            status: row.status,
            customerNameEn: row.customerNameEn,
            customerNameAr: row.customerNameAr,
            milestones: row.milestones || []
          })),
          ifrs16: leasesRes.rows.map((row: any) => ({
            id: row.id,
            contractNumber: row.contractNumber,
            commencementDate: row.commencementDate,
            leaseTermMonths: row.leaseTermMonths,
            monthlyPaymentBase: row.monthlyPaymentBase.toString(),
            discountRateBps: row.discountRateBps,
            rouAssetBase: row.rouAssetBase.toString(),
            leaseLiabilityBase: row.leaseLiabilityBase.toString(),
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
      const { type, milestoneId, scheduleId, contractId } = body;

      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        if (type === 'IFRS15_RECOGNIZE' && milestoneId) {
          // Satisfy milestone
          const mRes = await client.query(
            `UPDATE ifrs15_milestones
             SET is_satisfied = true, satisfied_date = CURRENT_DATE, completion_percentage = 100
             WHERE id = $1 AND tenant_id = $2
             RETURNING contract_id, milestone_name, milestone_value_base`,
            [milestoneId, session.tenantId]
          );

          if (mRes.rows.length === 0) {
            return NextResponse.json({ error: 'Milestone not found', code: 'NOT_FOUND' }, { status: 404 });
          }

          const { contract_id, milestone_name, milestone_value_base } = mRes.rows[0];
          await client.query(
            `UPDATE ifrs15_contracts
             SET recognized_revenue_base = recognized_revenue_base + $1,
                 deferred_revenue_base = GREATEST(0, deferred_revenue_base - $1)
             WHERE id = $2 AND tenant_id = $3`,
            [milestone_value_base, contract_id, session.tenantId]
          );

          await client.query(
            `INSERT INTO audit_logs (tenant_id, entity_id, user_id, role, action, resource_type, resource_id, diff_hash, payload_after)
             VALUES ($1, $2, $3, $4, 'IFRS15_REVENUE_RECOGNIZED', 'IFRS15_MILESTONE', $5, 'IFRS15_HASH', $6::jsonb)`,
            [
              session.tenantId,
              session.entityId,
              session.userId,
              session.role,
              milestoneId,
              JSON.stringify({ milestoneName: milestone_name, recognizedBase: milestone_value_base.toString() })
            ]
          );

          return NextResponse.json({
            success: true,
            milestoneId,
            milestoneName: milestone_name,
            recognizedAmountBase: milestone_value_base.toString()
          });
        }

        if (type === 'IFRS16_POST_SCHEDULE' && scheduleId) {
          // Post lease amortization
          const sRes = await client.query(
            `UPDATE lease_schedules
             SET is_posted = true
             WHERE id = $1 AND tenant_id = $2
             RETURNING contract_id, period_month, payment_base, principal_base, interest_base`,
            [scheduleId, session.tenantId]
          );

          if (sRes.rows.length === 0) {
            return NextResponse.json({ error: 'Schedule not found', code: 'NOT_FOUND' }, { status: 404 });
          }

          const row = sRes.rows[0];
          await client.query(
            `INSERT INTO audit_logs (tenant_id, entity_id, user_id, role, action, resource_type, resource_id, diff_hash, payload_after)
             VALUES ($1, $2, $3, $4, 'IFRS16_SCHEDULE_POSTED', 'LEASE_SCHEDULE', $5, 'IFRS16_HASH', $6::jsonb)`,
            [
              session.tenantId,
              session.entityId,
              session.userId,
              session.role,
              scheduleId,
              JSON.stringify({ periodMonth: row.period_month, paymentBase: row.payment_base.toString() })
            ]
          );

          return NextResponse.json({
            success: true,
            scheduleId,
            periodMonth: row.period_month,
            paymentBase: row.payment_base.toString()
          });
        }

        return NextResponse.json({ error: 'Invalid action type', code: 'INVALID_TYPE' }, { status: 400 });
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: 'IFRS action failed: ' + err.message, code: 'DB_ERROR' },
        { status: 500 }
      );
    }
  }
);
