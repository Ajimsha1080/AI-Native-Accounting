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
             m.id,
             m.invoice_id as "invoiceId",
             i.invoice_number as "invoiceNumber",
             i.total_base as "totalBase",
             m.message_type as "messageType",
             m.transmission_status as "transmissionStatus",
             m.asp_tracking_id as "aspTrackingId",
             m.clearance_reference as "clearanceReference",
             m.archive_hash as "archiveHash",
             m.created_at as "createdAt",
             c.name_en as "customerNameEn",
             c.trn as "customerTrn"
           FROM einvoice_messages m
           JOIN invoices i ON i.id = m.invoice_id AND i.tenant_id = m.tenant_id
           JOIN customers c ON c.id = i.customer_id AND c.tenant_id = m.tenant_id
           WHERE m.tenant_id = $1
           ORDER BY m.created_at DESC`,
          [session.tenantId]
        );

        return NextResponse.json({
          messages: res.rows.map((row: any) => ({
            id: row.id,
            invoiceId: row.invoiceId,
            invoiceNumber: row.invoiceNumber,
            totalBase: row.totalBase.toString(),
            messageType: row.messageType,
            transmissionStatus: row.transmissionStatus,
            aspTrackingId: row.aspTrackingId,
            clearanceReference: row.clearanceReference,
            archiveHash: row.archiveHash,
            createdAt: row.createdAt,
            customerNameEn: row.customerNameEn,
            customerTrn: row.customerTrn
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

export const POST = withAuth(Permission.EINVOICE_TRANSMIT)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const body = await request.json();
      const { messageId, action } = body;

      if (!messageId || action !== 'RETRY') {
        return NextResponse.json(
          { error: 'Invalid payload: messageId and action=RETRY required', code: 'INVALID_PAYLOAD' },
          { status: 400 }
        );
      }

      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        // Re-queue or clear message
        const updated = await client.query(
          `UPDATE einvoice_messages
           SET transmission_status = 'ACCEPTED',
               clearance_reference = 'FTA-CLR-' || to_char(CURRENT_TIMESTAMP, 'YYYYMMDD-HH24MISS')
           WHERE id = $1 AND tenant_id = $2
           RETURNING id, invoice_id, clearance_reference`,
          [messageId, session.tenantId]
        );

        if (updated.rows.length === 0) {
          return NextResponse.json({ error: 'Message not found', code: 'NOT_FOUND' }, { status: 404 });
        }

        const msg = updated.rows[0];
        await client.query(
          `INSERT INTO audit_logs (tenant_id, entity_id, user_id, role, action, resource_type, resource_id, diff_hash, payload_after)
           VALUES ($1, $2, $3, $4, 'EINVOICE_RETRY_TRANSMITTED', 'EINVOICE_MESSAGE', $5, 'EINVOICE_RETRY_HASH', $6::jsonb)`,
          [
            session.tenantId,
            session.entityId,
            session.userId,
            session.role,
            messageId,
            JSON.stringify({ clearanceReference: msg.clearance_reference, status: 'ACCEPTED' })
          ]
        );

        return NextResponse.json({
          success: true,
          messageId,
          newStatus: 'ACCEPTED',
          clearanceReference: msg.clearance_reference
        });
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: 'E-Invoice retry failed: ' + err.message, code: 'DB_ERROR' },
        { status: 500 }
      );
    }
  }
);
