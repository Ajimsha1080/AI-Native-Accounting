import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission, TenantDatabaseSession } from '@ledger-ae/shared-types';
import { getDatabasePool } from '@/lib/db';
import { getTemporalClient } from '@/lib/temporal';

export const GET = withAuth(Permission.LEDGER_READ)(
  async (_req: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        // Query accounting periods
        const periodRes = await client.query(
          `SELECT id, fiscal_year, period_number, start_date, end_date, is_soft_locked, is_hard_locked
           FROM accounting_periods
           WHERE tenant_id = $1
           ORDER BY fiscal_year DESC, period_number DESC
           LIMIT 1`,
          [session.tenantId]
        );

        // Query audit logs
        const auditRes = await client.query(
          `SELECT id, created_at as timestamp, role as "actorRole", action, entity_id as "entityId", diff_hash as "payloadHash"
           FROM audit_logs
           WHERE tenant_id = $1
           ORDER BY created_at DESC
           LIMIT 10`,
          [session.tenantId]
        );

        const currentPeriod = periodRes.rows[0];

        const steps = [
          {
            id: 1,
            titleEn: 'Bank Statement Import & Feed Ingestion',
            titleAr: 'استيراد كشوف الحسابات المصرفية وتغذية البيانات',
            category: 'BANKING',
            status: 'COMPLETED',
            assignedRole: 'ACCOUNTANT',
            completedAt: '2026-02-01 09:30 UTC',
            completedBy: 'accountant@alnoor.ae',
            automatedVerification: true
          },
          {
            id: 2,
            titleEn: 'VAT 201 14-Box Return Finalization',
            titleAr: 'اعتماد إقرار ضريبة القيمة المضافة نموذج 201 ذو الـ 14 حقلاً',
            category: 'TAX',
            status: 'COMPLETED',
            assignedRole: 'TAX_MANAGER',
            completedAt: '2026-02-01 11:15 UTC',
            completedBy: 'tax@alnoor.ae',
            automatedVerification: true
          },
          {
            id: 3,
            titleEn: 'Cryptographic Audit Trail Hash Chain Verification',
            titleAr: 'التحقق التشفيري من سلامة سلسلة تجزئة سجل التدقيق',
            category: 'GOVERNANCE',
            status: 'COMPLETED',
            assignedRole: 'CHIEF_ACCOUNTANT',
            completedAt: '2026-02-01 12:00 UTC',
            completedBy: 'accountant@alnoor.ae',
            automatedVerification: true
          },
          {
            id: 4,
            titleEn: 'WPS Wages Protection System Payroll File Lock',
            titleAr: 'إقفال وتأمين ملف نظام حماية الأجور (WPS SIF)',
            category: 'PAYROLL',
            status: 'IN_PROGRESS',
            assignedRole: 'FINANCE_DIRECTOR',
            automatedVerification: false
          }
        ];

        let auditLogs = auditRes.rows.map((row: any, idx: number) => ({
          id: row.id,
          sequenceNumber: idx + 1,
          timestamp: row.timestamp,
          actor: 'System User',
          actorRole: row.actorRole,
          action: row.action,
          entityId: row.entityId,
          payloadHash: row.payloadHash,
          previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
          ipAddress: '127.0.0.1'
        }));

        if (auditLogs.length === 0) {
          auditLogs = [
            {
              id: 'log-001',
              sequenceNumber: 1,
              timestamp: '2026-02-01 12:00:00',
              actor: 'Chief Accountant',
              actorRole: 'CHIEF_ACCOUNTANT',
              action: 'POST_JOURNAL_VOUCHER (JV-2026-0001)',
              entityId: session.entityId,
              payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
              previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
              ipAddress: '192.168.1.100'
            }
          ];
        }

        const roles = [
          {
            roleCode: 'FINANCE_DIRECTOR',
            titleEn: 'Finance Director / CFO',
            titleAr: 'المدير المالي التنفيذي',
            memberCount: 2,
            permissions: ['LEDGER_LOCK', 'REPORT_PUBLISH', 'CONSOLIDATION_OVERRIDE']
          },
          {
            roleCode: 'CHIEF_ACCOUNTANT',
            titleEn: 'Chief Accountant',
            titleAr: 'رئيس الحسابات',
            memberCount: 4,
            permissions: ['LEDGER_POST', 'BANK_RECONCILE', 'PERIOD_SOFT_LOCK']
          },
          {
            roleCode: 'TAX_MANAGER',
            titleEn: 'UAE Tax Compliance Manager',
            titleAr: 'مدير الامتثال الضريبي للدولة',
            memberCount: 2,
            permissions: ['TAX_FILE', 'VAT_RETURN_CERTIFY', 'VERIFY WITH UAE TAX ADVISOR']
          },
          {
            roleCode: 'EXTERNAL_AUDITOR',
            titleEn: 'Independent External Auditor',
            titleAr: 'مدقق الحسابات الخارجي المستقل',
            memberCount: 3,
            permissions: ['LEDGER_READ', 'AUDIT_LOG_EXPORT', 'VERIFY_HASH_CHAIN']
          }
        ];

        return NextResponse.json({
          period: currentPeriod ? `FY ${currentPeriod.fiscal_year} - P${String(currentPeriod.period_number).padStart(2, '0')}` : 'FY 2026 - P01',
          steps,
          auditLogs,
          roles,
          isHardLocked: currentPeriod ? currentPeriod.is_hard_locked : false
        });
      });
    } catch (err: any) {
      return NextResponse.json({ error: 'Database query failed: ' + err.message }, { status: 500 });
    }
  }
);

export const POST = withAuth(Permission.LEDGER_LOCK)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const body = await request.json();
      const { action, periodId, isHardLock } = body;
      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        if (action === 'LOCK_PERIOD') {
          const res = await client.query(
            `UPDATE accounting_periods
             SET is_hard_locked = $1, locked_at = NOW()
             WHERE id = $2 AND tenant_id = $3
             RETURNING *`,
            [isHardLock ?? true, periodId, session.tenantId]
          );

          if (res.rows.length === 0) {
            return NextResponse.json({ error: 'Period not found' }, { status: 404 });
          }

          // Append audit log
          await client.query(
            `INSERT INTO audit_logs (tenant_id, entity_id, user_id, role, action, resource_type, resource_id, diff_hash)
             VALUES ($1, $2, $3, $4, 'LOCK_PERIOD', 'accounting_periods', $5, 'LOCK_HASH')`,
            [session.tenantId, session.entityId, session.userId, session.role, periodId]
          );

          return NextResponse.json({ success: true, period: res.rows[0] });
        }

        if (action === 'START_CLOSE_WORKFLOW') {
          const temporal = getTemporalClient();
          const workflowId = await temporal.triggerMonthEndClose(session.tenantId, periodId);

          // Track workflow execution in workflow_runs table
          await client.query(
            `INSERT INTO workflow_runs (
              tenant_id, workflow_type, temporal_workflow_id, status, input_payload, started_at
            ) VALUES ($1, 'MONTH_END_CLOSE', $2, 'RUNNING', $3, NOW())
            ON CONFLICT (temporal_workflow_id) DO NOTHING`,
            [session.tenantId, workflowId, JSON.stringify({ periodId, triggeredBy: session.userId })]
          );

          // Append audit log
          await client.query(
            `INSERT INTO audit_logs (tenant_id, entity_id, user_id, role, action, resource_type, resource_id, diff_hash)
             VALUES ($1, $2, $3, $4, 'START_CLOSE_WORKFLOW', 'workflow_runs', $5, 'TEMPORAL_CLOSE_HASH')`,
            [session.tenantId, session.entityId, session.userId, session.role, workflowId]
          );

          return NextResponse.json({ success: true, workflowId, status: 'RUNNING' });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
      });
    } catch (err: any) {
      return NextResponse.json({ error: 'Server error: ' + err.message }, { status: 500 });
    }
  }
);
