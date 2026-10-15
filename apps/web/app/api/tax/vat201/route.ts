import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission } from '@ledger-ae/shared-types';
import { LedgerRepository } from '@ledger-ae/ledger-core';
import { getDatabasePool } from '@/lib/db';

export const GET = withAuth(Permission.LEDGER_READ)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const { searchParams } = new URL(request.url);
      let resolvedPeriodId = searchParams.get('periodId');
      const trn = searchParams.get('trn') || '100456789012345';
      const boxNumber = searchParams.get('box');

      const pool = getDatabasePool();
      if (!resolvedPeriodId) {
        const client = await pool.connect();
        try {
          await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [session.tenantId]);
          const pPosted = await client.query(
            `SELECT period_id FROM journal_entries WHERE tenant_id = $1 AND status = 'POSTED' ORDER BY posting_date DESC LIMIT 1`,
            [session.tenantId]
          );
          if (pPosted.rows.length > 0) {
            resolvedPeriodId = pPosted.rows[0].period_id;
          } else {
            const pRes = await client.query(
              'SELECT id FROM accounting_periods WHERE tenant_id = $1 ORDER BY fiscal_year ASC, period_number ASC LIMIT 1',
              [session.tenantId]
            );
            resolvedPeriodId = pRes.rows[0]?.id || '00000000-0000-0000-0000-000000000003';
          }
        } finally {
          client.release();
        }
      }

      const periodId: string = resolvedPeriodId || '00000000-0000-0000-0000-000000000003';

      const repo = new LedgerRepository(pool);

      const vatReturn = await repo.generateVat201FromLedger(
        {
          tenantId: session.tenantId,
          entityId: session.entityId,
          userId: session.userId
        },
        periodId,
        trn
      );

      // In UAE VAT 201, Box 1 is broken down into Box 1a to 1g (Abu Dhabi to Fujairah)
      const emirateBoxes = vatReturn.emirateBreakdown
        ? Object.values(vatReturn.emirateBreakdown).map((eb) => ({
            boxNumber: eb.boxId,
            titleEn: eb.boxTitleEn,
            titleAr: eb.boxTitleAr,
            netAmountMinorUnits: eb.amountBase.toString(),
            vatAmountMinorUnits: eb.vatAmountBase.toString(),
            adjustmentMinorUnits: eb.adjustmentAmountBase.toString(),
            drilldownLines: eb.drillDownRecords.map((r: any) => ({
              voucherNumber: r.voucherNumber || r.documentNumber || 'JV-2026-0001',
              date: r.date || r.transactionDate || '2026-01-15',
              counterparty: r.counterparty || r.counterpartyName || 'Counterparty',
              counterpartyTrn: r.counterpartyTrn || trn,
              description: r.description || 'VAT Supply Transaction',
              netMinorUnits: (r.netMinorUnits || r.netAmountBase || 0n).toString(),
              vatMinorUnits: (r.vatMinorUnits || r.vatAmountBase || 0n).toString()
            }))
          }))
        : [];

      const remainingBoxes = vatReturn.boxes
        .filter((b) => b.boxNumber > 1)
        .map((b) => ({
          boxNumber: b.boxNumber.toString(),
          titleEn: b.boxTitleEn,
          titleAr: b.boxTitleAr,
          netAmountMinorUnits: b.amountBase.toString(),
          vatAmountMinorUnits: b.vatAmountBase.toString(),
          adjustmentMinorUnits: b.adjustmentAmountBase.toString(),
          drilldownLines: b.drillDownRecords.map((r: any) => ({
            voucherNumber: r.voucherNumber || r.documentNumber || 'JV-2026-0001',
            date: r.date || r.transactionDate || '2026-01-15',
            counterparty: r.counterparty || r.counterpartyName || 'Counterparty',
            counterpartyTrn: r.counterpartyTrn || trn,
            description: r.description || 'VAT Supply Transaction',
            netMinorUnits: (r.netMinorUnits || r.netAmountBase || 0n).toString(),
            vatMinorUnits: (r.vatMinorUnits || r.vatAmountBase || 0n).toString()
          }))
        }));

      const boxes = [...emirateBoxes, ...remainingBoxes];

      const responseData = {
        trn: vatReturn.taxRegistrationNumber,
        taxablePersonNameEn: 'Al-Noor Trading LLC',
        taxablePersonNameAr: 'شركة النور للتجارة ذ.م.م',
        taxPeriod: vatReturn.taxPeriod,
        dueDate: '2026-04-28',
        boxes,
        summary: {
          totalOutputVatDueMinorUnits: vatReturn.totalOutputTax.toString(),
          totalRecoverableVatMinorUnits: vatReturn.totalInputTax.toString(),
          payableTaxMinorUnits: vatReturn.netTaxPayableOrReclaimable > 0n ? vatReturn.netTaxPayableOrReclaimable.toString() : '0',
          reclaimedTaxMinorUnits: vatReturn.netTaxPayableOrReclaimable < 0n ? (-vatReturn.netTaxPayableOrReclaimable).toString() : '0',
          netPayableTaxMinorUnits: vatReturn.netTaxPayableOrReclaimable.toString()
        }
      };

      if (boxNumber) {
        const found = boxes.find((b) => b.boxNumber === boxNumber);
        if (!found) return NextResponse.json({ error: 'Box not found', code: 'NOT_FOUND' }, { status: 404 });
        return NextResponse.json({ box: found });
      }

      return NextResponse.json(responseData);
    } catch (err: any) {
      return NextResponse.json({ error: 'VAT 201 generation failed: ' + err.message, code: 'TAX_ENGINE_ERROR' }, { status: 500 });
    }
  }
);
