import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission, TenantDatabaseSession } from '@ledger-ae/shared-types';
import { getDatabasePool } from '@/lib/db';

export const GET = withAuth(Permission.LEDGER_READ)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const entityId = searchParams.get('entityId') || session.entityId;

      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        // Query cash balance from journal lines
        const cashRes = await client.query(
          `SELECT COALESCE(SUM(CASE WHEN l.direction = 'DEBIT' THEN l.amount_base ELSE -l.amount_base END), 0) as cash
           FROM journal_lines l
           JOIN chart_of_accounts c ON c.id = l.account_id
           WHERE l.tenant_id = $1 AND l.legal_entity_id = $2 AND c.sub_type IN ('CASH', 'BANK')`,
          [session.tenantId, entityId]
        );

        // Query AR balance
        const arRes = await client.query(
          `SELECT COALESCE(SUM(CASE WHEN l.direction = 'DEBIT' THEN l.amount_base ELSE -l.amount_base END), 0) as ar
           FROM journal_lines l
           JOIN chart_of_accounts c ON c.id = l.account_id
           WHERE l.tenant_id = $1 AND l.legal_entity_id = $2 AND c.code = '1200'`,
          [session.tenantId, entityId]
        );

        // Query AP balance
        const apRes = await client.query(
          `SELECT COALESCE(SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount_base ELSE -l.amount_base END), 0) as ap
           FROM journal_lines l
           JOIN chart_of_accounts c ON c.id = l.account_id
           WHERE l.tenant_id = $1 AND l.legal_entity_id = $2 AND c.code = '2010'`,
          [session.tenantId, entityId]
        );

        // Query VAT liability
        const vatRes = await client.query(
          `SELECT COALESCE(SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount_base ELSE -l.amount_base END), 0) as vat
           FROM journal_lines l
           JOIN chart_of_accounts c ON c.id = l.account_id
           WHERE l.tenant_id = $1 AND l.legal_entity_id = $2 AND c.code = '2110'`,
          [session.tenantId, entityId]
        );

        const cashMinorUnits = BigInt(cashRes.rows[0].cash);
        const arTotalMinorUnits = BigInt(arRes.rows[0].ar);
        const apTotalMinorUnits = BigInt(apRes.rows[0].ap);
        const vatLiabilityMinorUnits = BigInt(vatRes.rows[0].vat);

        return NextResponse.json({
          tenantId: session.tenantId,
          entityId,
          userRole: session.role,
          period: 'FY2026-P01',
          cash: {
            totalMinorUnits: cashMinorUnits.toString(),
            currency: 'AED',
            changePercentage: 0,
            bankAccounts: [
              { name: 'Emirates NBD - Operating (AED)', iban: 'AE120260000001234567891', minorUnits: cashMinorUnits.toString() }
            ]
          },
          arAgeing: {
            totalMinorUnits: arTotalMinorUnits.toString(),
            current_0_30: arTotalMinorUnits.toString(),
            past_31_60: '0',
            past_61_90: '0',
            over_90: '0'
          },
          apAgeing: {
            totalMinorUnits: apTotalMinorUnits.toString(),
            current_0_30: apTotalMinorUnits.toString(),
            past_31_60: '0',
            past_61_90: '0',
            over_90: '0'
          },
          vatLiability: {
            netPayableMinorUnits: vatLiabilityMinorUnits.toString(),
            outputVatMinorUnits: vatLiabilityMinorUnits.toString(),
            inputVatRecoverableMinorUnits: '0',
            period: '2026-Q1',
            dueDate: '2026-04-28',
            formBoxStatus: 'BOX_1_TO_14_READY',
            isDesignatedZone: false
          },
          closeStatus: {
            totalSteps: 12,
            completedSteps: 8,
            period: 'FY2026-P01',
            daysRemaining: 4,
            checklist: []
          },
          aiProposals: []
        });
      });
    } catch (err: any) {
      return NextResponse.json({ error: 'Database query failed: ' + err.message }, { status: 500 });
    }
  }
);
