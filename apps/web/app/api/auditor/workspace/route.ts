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
        // 1. Period Lock Status
        const periodsRes = await client.query(
          `SELECT
             fiscal_year as "fiscalYear",
             period_number as "periodNumber",
             start_date as "startDate",
             end_date as "endDate",
             is_hard_locked as "isHardLocked",
             is_soft_locked as "isSoftLocked"
           FROM accounting_periods
           WHERE tenant_id = $1
           ORDER BY fiscal_year DESC, period_number ASC`,
          [session.tenantId]
        );

        // 2. Sample Vouchers for Audit Verification
        const samplesRes = await client.query(
          `SELECT
             j.id,
             j.entry_number as "entryNumber",
             j.posting_date as "entryDate",
             COALESCE(j.memo_en, '') as "narration",
             (j.status = 'POSTED') as "isPosted",
             j.posted_at as "createdAt",
             COALESCE(u.email, 'system@ledger.ae') as "createdByUser",
             json_agg(
               json_build_object(
                 'code', c.code,
                 'nameEn', c.name_en,
                 'direction', l.direction,
                 'amountBase', l.amount_base::text
               ) ORDER BY l.line_order ASC
             ) as lines
           FROM journal_entries j
           LEFT JOIN users u ON u.id = j.created_by AND u.tenant_id = j.tenant_id
           JOIN journal_lines l ON l.journal_entry_id = j.id AND l.tenant_id = j.tenant_id
           JOIN chart_of_accounts c ON c.id = l.account_id AND c.tenant_id = j.tenant_id
           WHERE j.tenant_id = $1
           GROUP BY j.id, j.entry_number, j.posting_date, j.memo_en, j.status, j.posted_at, u.email
           ORDER BY j.posted_at DESC
           LIMIT 10`,
          [session.tenantId]
        );

        // 3. FAF Metadata
        const fafMeta = {
          auditPeriod: 'FY 2026 - Q1',
          ftaAuditFormatVersion: 'FAF v1.0.0',
          statutoryFramework: 'Federal Decree-Law No. 8 of 2017 & No. 47 of 2022',
          generatedTimestamp: new Date().toISOString(),
          nonRepudiationHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        };

        return NextResponse.json({
          auditorWorkspace: {
            tenantId: session.tenantId,
            mode: 'READ_ONLY_AUDIT',
            periods: periodsRes.rows,
            auditSamples: samplesRes.rows,
            taxAuditFile: fafMeta
          }
        });
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: 'Auditor workspace query failed: ' + err.message, code: 'DB_ERROR' },
        { status: 500 }
      );
    }
  }
);
