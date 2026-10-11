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
          const res = await client.query(
            `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2`,
            [id, session.tenantId]
          );
          if (res.rows.length === 0) {
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
          }
          const inv = res.rows[0];
          return NextResponse.json({
            invoice: {
              id: inv.id,
              type: inv.type || 'SALES_INVOICE',
              documentNumber: inv.invoice_number,
              issueDate: inv.issue_date,
              dueDate: inv.due_date,
              partyNameEn: inv.customer_name_en || 'Customer',
              partyNameAr: inv.customer_name_ar || 'العميل',
              partyTrn: inv.trn || '',
              status: inv.status,
              subtotalMinorUnits: inv.net_amount_base.toString(),
              vatMinorUnits: inv.vat_amount_base.toString(),
              totalMinorUnits: inv.total_amount_base.toString(),
              currency: inv.currency || 'AED',
              lines: []
            }
          });
        }

        let query = `SELECT * FROM invoices WHERE tenant_id = $1`;
        const params: any[] = [session.tenantId];

        if (type) {
          query += ` AND type = $2`;
          params.push(type);
        }
        query += ` ORDER BY issue_date DESC`;

        const res = await client.query(query, params);
        const list = res.rows.map((inv: any) => ({
          id: inv.id,
          type: inv.type || 'SALES_INVOICE',
          documentNumber: inv.invoice_number,
          issueDate: inv.issue_date,
          dueDate: inv.due_date,
          partyNameEn: inv.customer_name_en || 'Customer',
          partyNameAr: inv.customer_name_ar || 'العميل',
          partyTrn: inv.trn || '',
          status: inv.status,
          subtotalMinorUnits: inv.net_amount_base.toString(),
          vatMinorUnits: inv.vat_amount_base.toString(),
          totalMinorUnits: inv.total_amount_base.toString(),
          currency: inv.currency || 'AED',
          lines: []
        }));

        return NextResponse.json({ invoices: list, total: list.length });
      });
    } catch (err: any) {
      return NextResponse.json({ error: 'Database query failed: ' + err.message }, { status: 500 });
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
          const res = await client.query(
            `UPDATE invoices
             SET status = $1, updated_at = NOW()
             WHERE id = $2 AND tenant_id = $3
             RETURNING *`,
            [newStatus, invoiceId, session.tenantId]
          );

          if (res.rows.length === 0) {
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
          }

          return NextResponse.json({ success: true, invoice: res.rows[0] });
        });
      }

      if (action === 'TRANSMIT_EINVOICE') {
        const pool = getDatabasePool();
        const tenantSession = new TenantDatabaseSession(pool);

        return await tenantSession.withTenant(session.tenantId, async (client) => {
          const { ublXml } = body;
          const invoiceRes = await client.query(`SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2`, [invoiceId, session.tenantId]);
          if (invoiceRes.rows.length === 0) {
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
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

      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (err: any) {
      return NextResponse.json({ error: 'Server error: ' + err.message }, { status: 500 });
    }
  }
);
