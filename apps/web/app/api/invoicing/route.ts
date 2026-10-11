import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission, TenantDatabaseSession } from '@ledger-ae/shared-types';
import { getDatabasePool } from '@/lib/db';

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

      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (err: any) {
      return NextResponse.json({ error: 'Server error: ' + err.message }, { status: 500 });
    }
  }
);
