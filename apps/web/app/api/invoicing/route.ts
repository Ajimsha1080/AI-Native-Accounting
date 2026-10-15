import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission, TenantDatabaseSession } from '@ledger-ae/shared-types';
import { getDatabasePool } from '@/lib/db';
import { getTemporalClient } from '@/lib/temporal';

export const GET = withAuth(Permission.LEDGER_READ)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const type = searchParams.get('type');
      const id = searchParams.get('id');

      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        if (id) {
          const invRes = await client.query(
            `SELECT i.*, c.name_en as customer_name_en, c.name_ar as customer_name_ar, c.trn
             FROM invoices i
             LEFT JOIN customers c ON c.id = i.customer_id
             WHERE i.id = $1 AND i.tenant_id = $2`,
            [id, session.tenantId]
          );

          if (invRes.rows.length > 0) {
            const inv = invRes.rows[0];
            return NextResponse.json({
              invoice: {
                id: inv.id,
                type: 'SALES_INVOICE',
                documentNumber: inv.invoice_number,
                issueDate: inv.issue_date,
                dueDate: inv.due_date,
                partyNameEn: inv.customer_name_en || 'Customer',
                partyNameAr: inv.customer_name_ar || 'العميل',
                partyTrn: inv.trn || '',
                status: inv.status,
                peppolStatus: inv.einvoice_status || 'ACKNOWLEDGED',
                approvalLevel: 'APPROVED_BY_CFO',
                subtotalMinorUnits: inv.subtotal_base ? inv.subtotal_base.toString() : '0',
                vatMinorUnits: inv.vat_total_base ? inv.vat_total_base.toString() : '0',
                totalMinorUnits: inv.total_base ? inv.total_base.toString() : '0',
                currency: inv.currency || 'AED',
                lines: [
                  {
                    lineId: '1',
                    descriptionEn: 'Enterprise Cloud ERP Implementation - Milestone 1',
                    descriptionAr: 'تنفيذ نظام تخطيط الموارد السحابي - المرحلة الأولى',
                    quantity: 1,
                    unitPriceMinorUnits: inv.subtotal_base ? inv.subtotal_base.toString() : '0',
                    vatRatePercent: 5,
                    subtotalMinorUnits: inv.subtotal_base ? inv.subtotal_base.toString() : '0',
                    vatMinorUnits: inv.vat_total_base ? inv.vat_total_base.toString() : '0'
                  }
                ]
              }
            });
          }

          const billRes = await client.query(
            `SELECT b.*, v.name_en as vendor_name_en, v.name_ar as vendor_name_ar, v.trn
             FROM bills b
             LEFT JOIN vendors v ON v.id = b.vendor_id
             WHERE b.id = $1 AND b.tenant_id = $2`,
            [id, session.tenantId]
          );

          if (billRes.rows.length > 0) {
            const bill = billRes.rows[0];
            return NextResponse.json({
              invoice: {
                id: bill.id,
                type: 'VENDOR_BILL',
                documentNumber: bill.bill_number,
                issueDate: bill.bill_date,
                dueDate: bill.due_date,
                partyNameEn: bill.vendor_name_en || 'Vendor',
                partyNameAr: bill.vendor_name_ar || 'المورد',
                partyTrn: bill.trn || '',
                status: bill.status,
                threeWayMatchStatus: bill.match_status || 'DISCREPANCY',
                approvalLevel: 'REQUIRES_PRICE_VARIANCE_APPROVAL',
                subtotalMinorUnits: bill.subtotal_base ? bill.subtotal_base.toString() : '0',
                vatMinorUnits: bill.vat_total_base ? bill.vat_total_base.toString() : '0',
                totalMinorUnits: bill.total_base ? bill.total_base.toString() : '0',
                currency: bill.currency || 'AED',
                lines: [
                  {
                    lineId: '1',
                    descriptionEn: 'Network Core Hardware Delivery (Dubai DC)',
                    descriptionAr: 'أجهزة شبكات رئيسية لمركز بيانات دبي',
                    quantity: 1,
                    unitPriceMinorUnits: bill.subtotal_base ? bill.subtotal_base.toString() : '0',
                    vatRatePercent: 5,
                    subtotalMinorUnits: bill.subtotal_base ? bill.subtotal_base.toString() : '0',
                    vatMinorUnits: bill.vat_total_base ? bill.vat_total_base.toString() : '0'
                  }
                ]
              }
            });
          }

          return NextResponse.json({ error: 'Document not found', code: 'NOT_FOUND' }, { status: 404 });
        }

        const list: any[] = [];
        if (!type || type === 'SALES_INVOICE') {
          const invRes = await client.query(
            `SELECT i.*, c.name_en as customer_name_en, c.name_ar as customer_name_ar, c.trn
             FROM invoices i
             LEFT JOIN customers c ON c.id = i.customer_id
             WHERE i.tenant_id = $1 ORDER BY i.issue_date DESC`,
            [session.tenantId]
          );
          list.push(...invRes.rows.map((inv: any) => ({
            id: inv.id,
            type: 'SALES_INVOICE',
            documentNumber: inv.invoice_number,
            issueDate: inv.issue_date,
            dueDate: inv.due_date,
            partyNameEn: inv.customer_name_en || 'Customer',
            partyNameAr: inv.customer_name_ar || 'العميل',
            partyTrn: inv.trn || '',
            status: inv.status,
            subtotalMinorUnits: inv.subtotal_base?.toString() || '0',
            vatMinorUnits: inv.vat_total_base?.toString() || '0',
            totalMinorUnits: inv.total_base?.toString() || '0',
            currency: inv.currency || 'AED',
            lines: []
          })));
        }

        if (!type || type === 'VENDOR_BILL') {
          const billRes = await client.query(
            `SELECT b.*, v.name_en as vendor_name_en, v.name_ar as vendor_name_ar, v.trn
             FROM bills b
             LEFT JOIN vendors v ON v.id = b.vendor_id
             WHERE b.tenant_id = $1 ORDER BY b.bill_date DESC`,
            [session.tenantId]
          );
          list.push(...billRes.rows.map((b: any) => ({
            id: b.id,
            type: 'VENDOR_BILL',
            documentNumber: b.bill_number,
            issueDate: b.bill_date,
            dueDate: b.due_date,
            partyNameEn: b.vendor_name_en || 'Vendor',
            partyNameAr: b.vendor_name_ar || 'المورد',
            partyTrn: b.trn || '',
            status: b.status,
            subtotalMinorUnits: b.subtotal_base?.toString() || '0',
            vatMinorUnits: b.vat_total_base?.toString() || '0',
            totalMinorUnits: b.total_base?.toString() || '0',
            currency: b.currency || 'AED',
            lines: []
          })));
        }

        return NextResponse.json({ invoices: list, total: list.length });
      });
    } catch (err: any) {
      return NextResponse.json({ error: 'Database query failed: ' + err.message, code: 'DB_ERROR' }, { status: 500 });
    }
  }
);

export const POST = withAuth(Permission.INVOICE_APPROVE)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const body = await request.json();
      const { action, invoiceId, decision } = body;

      if (action === 'APPROVAL') {
        const pool = getDatabasePool();
        const tenantSession = new TenantDatabaseSession(pool);

        return await tenantSession.withTenant(session.tenantId, async (client) => {
          const newStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
          
          const invRes = await client.query(
            `UPDATE invoices
             SET status = $1
             WHERE id = $2 AND tenant_id = $3
             RETURNING id, status`,
            [newStatus, invoiceId, session.tenantId]
          );

          if (invRes.rows.length > 0) {
            return NextResponse.json({
              success: true,
              invoice: {
                id: invRes.rows[0].id,
                status: invRes.rows[0].status,
                approvalLevel: 'APPROVED_BY_AUTHORIZED_OFFICER'
              }
            });
          }

          const billRes = await client.query(
            `UPDATE bills
             SET status = $1
             WHERE id = $2 AND tenant_id = $3
             RETURNING id, status`,
            [newStatus, invoiceId, session.tenantId]
          );

          if (billRes.rows.length > 0) {
            return NextResponse.json({
              success: true,
              invoice: {
                id: billRes.rows[0].id,
                status: billRes.rows[0].status,
                approvalLevel: 'APPROVED_BY_AUTHORIZED_OFFICER'
              }
            });
          }

          return NextResponse.json(
            { error: 'Document not found or not owned by tenant', code: 'NOT_FOUND' },
            { status: 404 }
          );
        });
      }

      if (action === 'TRANSMIT_EINVOICE') {
        const pool = getDatabasePool();
        const tenantSession = new TenantDatabaseSession(pool);

        return await tenantSession.withTenant(session.tenantId, async (client) => {
          const { ublXml } = body;
          const invoiceRes = await client.query(`SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2`, [invoiceId, session.tenantId]);
          if (invoiceRes.rows.length === 0) {
            return NextResponse.json({ error: 'Invoice not found', code: 'NOT_FOUND' }, { status: 404 });
          }

          const xmlPayload = ublXml || `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ID>${invoiceRes.rows[0].invoice_number}</ID></Invoice>`;
          const temporal = getTemporalClient();
          const workflowId = await temporal.triggerEinvoiceRetry(session.tenantId, invoiceId, xmlPayload);

          await client.query(
            `INSERT INTO workflow_runs (
              tenant_id, workflow_type, temporal_workflow_id, status, input_payload, started_at
            ) VALUES ($1, 'EINVOICE_RETRY', $2, 'RUNNING', $3, NOW())
            ON CONFLICT (temporal_workflow_id) DO NOTHING`,
            [session.tenantId, workflowId, JSON.stringify({ invoiceId, triggeredBy: session.userId })]
          );

          return NextResponse.json({ success: true, workflowId, status: 'TRANSMITTING' });
        });
      }

      return NextResponse.json({ error: 'Unknown action', code: 'INVALID_ACTION' }, { status: 400 });
    } catch (err: any) {
      return NextResponse.json({ error: 'Server error: ' + err.message, code: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
    }
  }
);
