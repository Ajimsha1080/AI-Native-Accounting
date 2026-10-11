import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { Permission } from '@ledger-ae/shared-types';

export interface InvoiceItem {
  id: string;
  type: 'SALES_INVOICE' | 'VENDOR_BILL';
  documentNumber: string;
  issueDate: string;
  dueDate: string;
  partyNameEn: string;
  partyNameAr: string;
  partyTrn: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'CLEARED_PEPPOL' | 'PAID' | 'REJECTED';
  subtotalMinorUnits: string; // fils
  vatMinorUnits: string; // fils
  totalMinorUnits: string; // fils
  currency: string;
  peppolStatus?: 'TRANSMITTED' | 'ACKNOWLEDGED' | 'NOT_APPLICABLE';
  threeWayMatchStatus?: 'MATCHED' | 'DISCREPANCY' | 'PENDING_GRN';
  approvalLevel: string;
  lines: Array<{
    lineId: string;
    descriptionEn: string;
    descriptionAr: string;
    quantity: number;
    unitPriceMinorUnits: string;
    vatRatePercent: number;
    subtotalMinorUnits: string;
    vatMinorUnits: string;
  }>;
}

const INITIAL_INVOICES: InvoiceItem[] = [
  {
    id: 'inv-2026-001',
    type: 'SALES_INVOICE',
    documentNumber: 'INV-2026-0101',
    issueDate: '2026-01-10',
    dueDate: '2026-02-10',
    partyNameEn: 'Emaar Properties PJSC',
    partyNameAr: 'إعمار العقارية ش.م.ع',
    partyTrn: '100456789012345',
    status: 'CLEARED_PEPPOL',
    peppolStatus: 'ACKNOWLEDGED',
    approvalLevel: 'APPROVED_BY_CFO',
    subtotalMinorUnits: '50000000', // AED 500,000.00
    vatMinorUnits: '2500000', // AED 25,000.00 (5%)
    totalMinorUnits: '52500000', // AED 525,000.00
    currency: 'AED',
    lines: [
      {
        lineId: '1',
        descriptionEn: 'Enterprise Cloud ERP Implementation - Milestone 1',
        descriptionAr: 'تنفيذ نظام تخطيط الموارد السحابي - المرحلة الأولى',
        quantity: 1,
        unitPriceMinorUnits: '50000000',
        vatRatePercent: 5,
        subtotalMinorUnits: '50000000',
        vatMinorUnits: '2500000'
      }
    ]
  },
  {
    id: 'inv-2026-002',
    type: 'SALES_INVOICE',
    documentNumber: 'INV-2026-0102',
    issueDate: '2026-01-18',
    dueDate: '2026-02-18',
    partyNameEn: 'Al-Tayer Motors LLC',
    partyNameAr: 'الطاير للسيارات ذ.م.م',
    partyTrn: '100888999000111',
    status: 'PENDING_APPROVAL',
    peppolStatus: 'NOT_APPLICABLE',
    approvalLevel: 'PENDING_FINANCE_DIRECTOR',
    subtotalMinorUnits: '12000000', // AED 120,000.00
    vatMinorUnits: '600000', // AED 6,000.00
    totalMinorUnits: '12600000', // AED 126,000.00
    currency: 'AED',
    lines: [
      {
        lineId: '1',
        descriptionEn: 'Consulting Services - UAE Corporate Tax Readiness',
        descriptionAr: 'خدمات استشارية - الجاهزية لضريبة الشركات في الإمارات',
        quantity: 1,
        unitPriceMinorUnits: '12000000',
        vatRatePercent: 5,
        subtotalMinorUnits: '12000000',
        vatMinorUnits: '600000'
      }
    ]
  },
  {
    id: 'bill-2026-001',
    type: 'VENDOR_BILL',
    documentNumber: 'BILL-2026-5501',
    issueDate: '2026-01-12',
    dueDate: '2026-02-12',
    partyNameEn: 'Amazon Data Services UAE LLC',
    partyNameAr: 'أمازون لخدمات البيانات الإمارات ذ.م.م',
    partyTrn: '100222333444555',
    status: 'APPROVED',
    threeWayMatchStatus: 'MATCHED',
    approvalLevel: 'APPROVED_BY_AP_HEAD',
    subtotalMinorUnits: '8000000', // AED 80,000.00
    vatMinorUnits: '400000', // AED 4,000.00
    totalMinorUnits: '8400000', // AED 84,000.00
    currency: 'AED',
    lines: [
      {
        lineId: '1',
        descriptionEn: 'AWS Middle East (UAE me-central-1) Compute Capacity',
        descriptionAr: 'سعة خوادم أمازون الشرق الأوسط (الإمارات me-central-1)',
        quantity: 1,
        unitPriceMinorUnits: '8000000',
        vatRatePercent: 5,
        subtotalMinorUnits: '8000000',
        vatMinorUnits: '400000'
      }
    ]
  },
  {
    id: 'bill-2026-002',
    type: 'VENDOR_BILL',
    documentNumber: 'BILL-2026-5502',
    issueDate: '2026-01-22',
    dueDate: '2026-02-22',
    partyNameEn: 'Cisco Systems Gulf FZ-LLC',
    partyNameAr: 'سيسكو سيستمز جلف ش.ذ.م.م - م.ح',
    partyTrn: '100111222333444',
    status: 'PENDING_APPROVAL',
    threeWayMatchStatus: 'DISCREPANCY',
    approvalLevel: 'REQUIRES_PRICE_VARIANCE_APPROVAL',
    subtotalMinorUnits: '25000000', // AED 250,000.00
    vatMinorUnits: '1250000',
    totalMinorUnits: '26250000',
    currency: 'AED',
    lines: [
      {
        lineId: '1',
        descriptionEn: 'Network Core Hardware Delivery (Dubai DC)',
        descriptionAr: 'أجهزة شبكات رئيسية لمركز بيانات دبي',
        quantity: 1,
        unitPriceMinorUnits: '25000000',
        vatRatePercent: 5,
        subtotalMinorUnits: '25000000',
        vatMinorUnits: '1250000'
      }
    ]
  }
];

let INVOICES: InvoiceItem[] = JSON.parse(JSON.stringify(INITIAL_INVOICES));

export function resetInvoicesState() {
  INVOICES = JSON.parse(JSON.stringify(INITIAL_INVOICES));
}

export const GET = withAuth(Permission.LEDGER_READ)(async (request: NextRequest, _ctx) => {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id');
  const reset = searchParams.get('reset');

  if (reset === 'true' || reset === '1') {
    resetInvoicesState();
  }

  if (id) {
    const found = INVOICES.find((i) => i.id === id);
    if (!found) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    return NextResponse.json({ invoice: found });
  }

  let list = [...INVOICES];
  if (type) {
    list = list.filter((i) => i.type === type);
  }

  return NextResponse.json({ invoices: list, total: list.length });
});

export const POST = withAuth(Permission.INVOICE_APPROVE)(async (request: NextRequest, _ctx) => {
  try {
    const body = await request.json();
    const { action, invoiceId, decision } = body;

    if (action === 'APPROVAL') {
      const target = INVOICES.find((i) => i.id === invoiceId);
      if (!target) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

      if (decision === 'APPROVE') {
        target.status = target.type === 'SALES_INVOICE' ? 'CLEARED_PEPPOL' : 'APPROVED';
        target.approvalLevel = 'APPROVED_BY_AUTHORIZED_OFFICER';
        if (target.type === 'SALES_INVOICE') target.peppolStatus = 'ACKNOWLEDGED';
      } else {
        target.status = 'REJECTED';
        target.approvalLevel = 'REJECTED_BY_OFFICER';
      }

      return NextResponse.json({ success: true, invoice: target });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error: ' + err.message }, { status: 500 });
  }
});
