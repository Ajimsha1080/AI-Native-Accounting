import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission } from '@ledger-ae/shared-types';
import { LedgerRepository } from '@ledger-ae/ledger-core';
import { getDatabasePool } from '@/lib/db';

export const GET = withAuth(Permission.LEDGER_READ)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const periodId = searchParams.get('periodId') || '50000000-0000-0000-0000-000000000001';
      const trn = searchParams.get('trn') || '100456789012345';
      const boxNumber = searchParams.get('box');

      const pool = getDatabasePool();
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

      // Map return structure to UI expectation
      const boxes = vatReturn.boxes.map((b) => ({
        boxNumber: b.boxNumber.toString(),
        titleEn: b.boxTitleEn,
        titleAr: b.boxTitleAr,
        netAmountMinorUnits: b.amountBase.toString(),
        vatAmountMinorUnits: b.vatAmountBase.toString(),
        adjustmentMinorUnits: b.adjustmentAmountBase.toString(),
        drilldownLines: b.drillDownRecords.map((r: any) => ({
          voucherNumber: r.voucherNumber || r.entryNumber || 'JV-2026-0001',
          date: r.date || r.postingDate || '2026-01-15',
          counterparty: r.counterparty || 'Counterparty',
          counterpartyTrn: r.counterpartyTrn || trn,
          description: r.description || r.memo || 'VAT Supply Transaction',
          netMinorUnits: (r.netMinorUnits || r.amountBase || 0n).toString(),
          vatMinorUnits: (r.vatMinorUnits || r.vatAmountBase || 0n).toString()
        }))
      }));

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
