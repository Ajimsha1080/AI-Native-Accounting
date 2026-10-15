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
             pr.id,
             pr.period_year as "periodYear",
             pr.period_month as "periodMonth",
             pr.total_employees as "totalEmployees",
             pr.total_gross_base as "totalGrossBase",
             pr.total_net_base as "totalNetBase",
             pr.sif_file_name as "sifFileName",
             pr.sif_content as "sifContent",
             pr.status,
             json_agg(
               json_build_object(
                 'id', pe.id,
                 'employeeId', pe.employee_id,
                 'employeeName', pe.employee_name,
                 'iban', pe.iban,
                 'fixedSalaryBase', pe.fixed_salary_base,
                 'variableSalaryBase', pe.variable_salary_base,
                 'netSalaryBase', pe.net_salary_base,
                 'eosgAccruedBase', pe.eosg_accrued_base
               ) ORDER BY pe.employee_id ASC
             ) FILTER (WHERE pe.id IS NOT NULL) as employees
           FROM payroll_runs pr
           LEFT JOIN payroll_employees pe ON pe.payroll_run_id = pr.id AND pe.tenant_id = pr.tenant_id
           WHERE pr.tenant_id = $1
           GROUP BY pr.id, pr.period_year, pr.period_month, pr.total_employees, pr.total_gross_base, pr.total_net_base, pr.sif_file_name, pr.sif_content, pr.status
           ORDER BY pr.period_year DESC, pr.period_month DESC`,
          [session.tenantId]
        );

        return NextResponse.json({
          payrollRuns: res.rows.map((row: any) => ({
            id: row.id,
            periodYear: row.periodYear,
            periodMonth: row.periodMonth,
            totalEmployees: row.totalEmployees,
            totalGrossBase: row.totalGrossBase.toString(),
            totalNetBase: row.totalNetBase.toString(),
            sifFileName: row.sifFileName,
            sifContent: row.sifContent,
            status: row.status,
            employees: row.employees || []
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

export const POST = withAuth(Permission.PAYMENT_RUN_EXECUTE)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const body = await request.json();
      const { payrollRunId, action } = body;

      if (!payrollRunId || !['DISBURSE', 'GENERATE_SIF'].includes(action)) {
        return NextResponse.json(
          { error: 'Invalid payload: payrollRunId and valid action required', code: 'INVALID_PAYLOAD' },
          { status: 400 }
        );
      }

      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        const nextStatus = action === 'DISBURSE' ? 'DISBURSED' : 'SIF_GENERATED';

        const runRes = await client.query(
          `UPDATE payroll_runs
           SET status = $1
           WHERE id = $2 AND tenant_id = $3
           RETURNING id, period_year, period_month, total_net_base`,
          [nextStatus, payrollRunId, session.tenantId]
        );

        if (runRes.rows.length === 0) {
          return NextResponse.json({ error: 'Payroll run not found', code: 'NOT_FOUND' }, { status: 404 });
        }

        const run = runRes.rows[0];
        await client.query(
          `INSERT INTO audit_logs (tenant_id, entity_id, user_id, role, action, resource_type, resource_id, diff_hash, payload_after)
           VALUES ($1, $2, $3, $4, $5, 'PAYROLL_RUN', $6, 'PAYROLL_WPS_HASH', $7::jsonb)`,
          [
            session.tenantId,
            session.entityId,
            session.userId,
            session.role,
            `PAYROLL_${action}`,
            payrollRunId,
            JSON.stringify({ status: nextStatus, totalNetBase: run.total_net_base.toString() })
          ]
        );

        return NextResponse.json({
          success: true,
          payrollRunId,
          newStatus: nextStatus,
          period: `${run.period_year}-${run.period_month}`
        });
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: 'Payroll action failed: ' + err.message, code: 'DB_ERROR' },
        { status: 500 }
      );
    }
  }
);
