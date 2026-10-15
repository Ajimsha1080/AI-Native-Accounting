import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission, TenantDatabaseSession } from '@ledger-ae/shared-types';
import { getDatabasePool } from '@/lib/db';

export const GET = withAuth(Permission.TENANT_MANAGE)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        // Query Subscription
        const subRes = await client.query(
          `SELECT
             plan_tier as "planTier",
             is_sandbox as "isSandbox",
             max_entities as "maxEntities",
             max_monthly_invoices as "maxMonthlyInvoices",
             billing_cycle_start as "billingCycleStart",
             billing_cycle_end as "billingCycleEnd",
             status
           FROM tenant_subscriptions
           WHERE tenant_id = $1`,
          [session.tenantId]
        );

        // Query Usage Metering
        const usageRes = await client.query(
          `SELECT
             period_month as "periodMonth",
             invoices_created as "invoicesCreated",
             ai_tokens_consumed as "aiTokensConsumed",
             api_calls_count as "apiCallsCount",
             wps_transmissions_count as "wpsTransmissionsCount",
             updated_at as "updatedAt"
           FROM usage_metering
           WHERE tenant_id = $1
           ORDER BY period_month DESC`,
          [session.tenantId]
        );

        const subscription = subRes.rows[0] || {
          planTier: 'ENTERPRISE',
          isSandbox: false,
          maxEntities: 25,
          maxMonthlyInvoices: 50000,
          billingCycleStart: '2026-01-01',
          billingCycleEnd: '2026-12-31',
          status: 'ACTIVE'
        };

        return NextResponse.json({
          console: {
            tenantId: session.tenantId,
            subscription,
            usageHistory: usageRes.rows
          }
        });
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: 'Ops console query failed: ' + err.message, code: 'DB_ERROR' },
        { status: 500 }
      );
    }
  }
);

export const POST = withAuth(Permission.TENANT_MANAGE)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const body = await request.json();
      const { planTier, isSandbox } = body;

      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        const updateRes = await client.query(
          `UPDATE tenant_subscriptions
           SET plan_tier = COALESCE($1, plan_tier),
               is_sandbox = COALESCE($2, is_sandbox)
           WHERE tenant_id = $3
           RETURNING plan_tier as "planTier", is_sandbox as "isSandbox"`,
          [planTier, isSandbox, session.tenantId]
        );

        await client.query(
          `INSERT INTO audit_logs (tenant_id, entity_id, user_id, role, action, resource_type, resource_id, diff_hash, payload_after)
           VALUES ($1, $2, $3, $4, 'SUBSCRIPTION_UPDATED', 'TENANT_SUBSCRIPTION', $5, 'OPS_CONSOLE_HASH', $6::jsonb)`,
          [
            session.tenantId,
            session.entityId,
            session.userId,
            session.role,
            session.tenantId,
            JSON.stringify({ planTier, isSandbox })
          ]
        );

        return NextResponse.json({
          success: true,
          subscription: updateRes.rows[0]
        });
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: 'Ops console action failed: ' + err.message, code: 'DB_ERROR' },
        { status: 500 }
      );
    }
  }
);
