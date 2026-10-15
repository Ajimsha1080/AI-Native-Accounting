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
             b.id,
             b.bill_number as "billNumber",
             b.vendor_invoice_number as "vendorInvoiceNumber",
             b.bill_date as "billDate",
             b.due_date as "dueDate",
             b.currency,
             b.subtotal_base as "subtotalBase",
             b.vat_total_base as "vatTotalBase",
             b.total_base as "totalBase",
             b.status,
             b.match_status as "matchStatus",
             v.name_en as "vendorNameEn",
             v.name_ar as "vendorNameAr",
             v.trn as "vendorTrn",
             ba.id as "approvalId",
             ba.approval_status as "approvalStatus",
             ba.tier as "approvalTier",
             ba.notes as "approvalNotes"
           FROM bills b
           JOIN vendors v ON v.id = b.vendor_id AND v.tenant_id = b.tenant_id
           LEFT JOIN bill_approvals ba ON ba.bill_id = b.id AND ba.tenant_id = b.tenant_id
           WHERE b.tenant_id = $1
           ORDER BY b.created_at DESC`,
          [session.tenantId]
        );

        return NextResponse.json({
          bills: res.rows.map((row: any) => ({
            id: row.id,
            billNumber: row.billNumber,
            vendorInvoiceNumber: row.vendorInvoiceNumber,
            billDate: row.billDate,
            dueDate: row.dueDate,
            currency: row.currency,
            subtotalBase: row.subtotalBase.toString(),
            vatTotalBase: row.vatTotalBase.toString(),
            totalBase: row.totalBase.toString(),
            status: row.status,
            matchStatus: row.matchStatus,
            vendorNameEn: row.vendorNameEn,
            vendorNameAr: row.vendorNameAr,
            vendorTrn: row.vendorTrn,
            approval: row.approvalId
              ? {
                  id: row.approvalId,
                  status: row.approvalStatus,
                  tier: row.approvalTier,
                  notes: row.approvalNotes
                }
              : null
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

export const POST = withAuth(Permission.BILL_APPROVE_TIER2)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const body = await request.json();
      const { billId, action, notes } = body;

      if (!billId || !['APPROVE', 'REJECT'].includes(action)) {
        return NextResponse.json(
          { error: 'Invalid payload: billId and action (APPROVE/REJECT) required', code: 'INVALID_PAYLOAD' },
          { status: 400 }
        );
      }

      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

        // 1. Update bill approval record
        const approvalRes = await client.query(
          `UPDATE bill_approvals
           SET approval_status = $1, notes = COALESCE($2, notes), actioned_at = CURRENT_TIMESTAMP, approver_id = $3
           WHERE bill_id = $4 AND tenant_id = $5
           RETURNING id`,
          [newStatus, notes, session.userId, billId, session.tenantId]
        );

        // 2. Update bills status
        const billRes = await client.query(
          `UPDATE bills
           SET status = $1
           WHERE id = $2 AND tenant_id = $3
           RETURNING id, bill_number, total_base`,
          [newStatus, billId, session.tenantId]
        );

        if (billRes.rows.length === 0) {
          return NextResponse.json(
            { error: 'Bill not found or does not belong to tenant', code: 'NOT_FOUND' },
            { status: 404 }
          );
        }

        // 3. Write immutable audit log
        await client.query(
          `INSERT INTO audit_logs (tenant_id, entity_id, user_id, role, action, resource_type, resource_id, diff_hash, payload_after)
           VALUES ($1, $2, $3, $4, $5, 'BILL', $6, 'BILL_APPROVAL_HASH', $7::jsonb)`,
          [
            session.tenantId,
            session.entityId,
            session.userId,
            session.role,
            `BILL_${action}`,
            billId,
            JSON.stringify({ status: newStatus, notes, totalBase: billRes.rows[0].total_base.toString() })
          ]
        );

        return NextResponse.json({
          success: true,
          billId,
          billNumber: billRes.rows[0].bill_number,
          newStatus,
          actionedAt: new Date().toISOString()
        });
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: 'Database update failed: ' + err.message, code: 'DB_ERROR' },
        { status: 500 }
      );
    }
  }
);
