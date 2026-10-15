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
             p.id,
             p.payment_number as "paymentNumber",
             p.payment_type as "paymentType",
             p.payment_date as "paymentDate",
             p.amount_base as "amountBase",
             p.currency,
             p.partner_id as "partnerId",
             COALESCE(c.name_en, v.name_en, 'Direct Settlement') as "partnerNameEn",
             COALESCE(c.name_ar, v.name_ar, 'تسوية مباشرة') as "partnerNameAr",
             pa.id as "allocationId",
             pa.allocated_amount_base as "allocatedAmountBase",
             pa.invoice_id as "invoiceId",
             pa.bill_id as "billId"
           FROM payments p
           LEFT JOIN customers c ON c.id = p.partner_id AND c.tenant_id = p.tenant_id
           LEFT JOIN vendors v ON v.id = p.partner_id AND v.tenant_id = p.tenant_id
           LEFT JOIN payment_allocations pa ON pa.payment_id = p.id AND pa.tenant_id = p.tenant_id
           WHERE p.tenant_id = $1
           ORDER BY p.payment_date DESC`,
          [session.tenantId]
        );

        return NextResponse.json({
          payments: res.rows.map((row: any) => ({
            id: row.id,
            paymentNumber: row.paymentNumber,
            paymentType: row.paymentType,
            paymentDate: row.paymentDate,
            amountBase: row.amountBase.toString(),
            currency: row.currency,
            partnerId: row.partnerId,
            partnerNameEn: row.partnerNameEn,
            partnerNameAr: row.partnerNameAr,
            allocation: row.allocationId
              ? {
                  id: row.allocationId,
                  allocatedAmountBase: row.allocatedAmountBase.toString(),
                  invoiceId: row.invoiceId,
                  billId: row.billId
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

export const POST = withAuth(Permission.PAYMENT_RUN_EXECUTE)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const body = await request.json();
      const { paymentType, partnerId, amountBase, invoiceId, billId } = body;

      if (!paymentType || !partnerId || !amountBase) {
        return NextResponse.json(
          { error: 'Invalid payload: paymentType, partnerId, and amountBase required', code: 'INVALID_PAYLOAD' },
          { status: 400 }
        );
      }

      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        const paymentNumber = `PAY-${Date.now().toString().slice(-6)}`;
        const amountFils = BigInt(amountBase);

        // 1. Insert payment record
        const pRes = await client.query(
          `INSERT INTO payments (tenant_id, legal_entity_id, payment_number, payment_type, partner_id, payment_date, amount_txn, currency, amount_base)
           VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, 'AED', $6)
           RETURNING id`,
          [session.tenantId, session.entityId, paymentNumber, paymentType, partnerId, amountFils.toString()]
        );
        const paymentId = pRes.rows[0].id;

        // 2. Insert allocation if linked to invoice or bill
        if (invoiceId || billId) {
          await client.query(
            `INSERT INTO payment_allocations (tenant_id, payment_id, invoice_id, bill_id, allocated_amount_base)
             VALUES ($1, $2, $3, $4, $5)`,
            [session.tenantId, paymentId, invoiceId || null, billId || null, amountFils.toString()]
          );
        }

        // 3. Write immutable audit log
        await client.query(
          `INSERT INTO audit_logs (tenant_id, entity_id, user_id, role, action, resource_type, resource_id, diff_hash, payload_after)
           VALUES ($1, $2, $3, $4, 'PAYMENT_RECORDED', 'PAYMENT', $5, 'PAYMENT_HASH', $6::jsonb)`,
          [
            session.tenantId,
            session.entityId,
            session.userId,
            session.role,
            paymentId,
            JSON.stringify({ paymentNumber, paymentType, amountBase: amountFils.toString(), invoiceId, billId })
          ]
        );

        return NextResponse.json({
          success: true,
          paymentId,
          paymentNumber,
          amountBase: amountFils.toString()
        });
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: 'Payment posting failed: ' + err.message, code: 'DB_ERROR' },
        { status: 500 }
      );
    }
  }
);
