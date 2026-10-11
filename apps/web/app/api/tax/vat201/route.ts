import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { Permission } from '@ledger-ae/shared-types';

export interface VatBoxDrilldownLine {
  voucherNumber: string;
  date: string;
  counterparty: string;
  counterpartyTrn: string;
  description: string;
  netMinorUnits: string; // fils
  vatMinorUnits: string; // fils
}

export interface Vat201Box {
  boxNumber: string;
  titleEn: string;
  titleAr: string;
  netAmountMinorUnits: string; // integer fils
  vatAmountMinorUnits: string; // integer fils
  recoverableVatMinorUnits?: string;
  adjustmentMinorUnits?: string;
  isTotalBox?: boolean;
  drilldownLines: VatBoxDrilldownLine[];
}

export interface Vat201ReturnData {
  trn: string;
  taxablePersonNameEn: string;
  taxablePersonNameAr: string;
  taxPeriod: string;
  dueDate: string;
  boxes: Vat201Box[];
  summary: {
    totalOutputVatDueMinorUnits: string; // Box 1h
    totalRecoverableVatMinorUnits: string; // Box 11
    payableTaxMinorUnits: string; // Box 12
    reclaimedTaxMinorUnits: string; // Box 13
    netPayableTaxMinorUnits: string; // Box 14
  };
}

const VAT201_DATA: Vat201ReturnData = {
  trn: '100456789012345',
  taxablePersonNameEn: 'Al-Noor Trading LLC',
  taxablePersonNameAr: 'شركة النور للتجارة ذ.م.م',
  taxPeriod: '2026-Q1 (01 Jan 2026 - 31 Mar 2026)',
  dueDate: '2026-04-28',
  boxes: [
    {
      boxNumber: '1a',
      titleEn: 'Standard rated supplies in Abu Dhabi (5%)',
      titleAr: 'التوريدات الخاضعة للنسبة الأساسية في إمارة أبوظبي (5%)',
      netAmountMinorUnits: '650000000', // AED 6,500,000.00
      vatAmountMinorUnits: '32500000', // AED 325,000.00
      adjustmentMinorUnits: '0',
      drilldownLines: [
        {
          voucherNumber: 'JV-2026-0041',
          date: '2026-01-14',
          counterparty: 'ADNOC Distribution PJSC',
          counterpartyTrn: '100123456789001',
          description: 'Industrial lubricants supply - Abu Dhabi Depot',
          netMinorUnits: '400000000',
          vatMinorUnits: '20000000'
        },
        {
          voucherNumber: 'JV-2026-0082',
          date: '2026-02-20',
          counterparty: 'Aldar Properties PJSC',
          counterpartyTrn: '100987654321002',
          description: 'Commercial facilities management software services',
          netMinorUnits: '250000000',
          vatMinorUnits: '12500000'
        }
      ]
    },
    {
      boxNumber: '1b',
      titleEn: 'Standard rated supplies in Dubai (5%)',
      titleAr: 'التوريدات الخاضعة للنسبة الأساسية في إمارة دبي (5%)',
      netAmountMinorUnits: '1620000000', // AED 16,200,000.00
      vatAmountMinorUnits: '81000000', // AED 810,000.00
      adjustmentMinorUnits: '0',
      drilldownLines: [
        {
          voucherNumber: 'INV-2026-0101',
          date: '2026-01-10',
          counterparty: 'Emaar Properties PJSC',
          counterpartyTrn: '100456789012345',
          description: 'Enterprise ERP Implementation - Milestone 1',
          netMinorUnits: '1000000000',
          vatMinorUnits: '50000000'
        },
        {
          voucherNumber: 'INV-2026-0102',
          date: '2026-01-18',
          counterparty: 'Al-Tayer Motors LLC',
          counterpartyTrn: '100888999000111',
          description: 'Corporate Tax advisory consultation services',
          netMinorUnits: '620000000',
          vatMinorUnits: '31000000'
        }
      ]
    },
    {
      boxNumber: '1c',
      titleEn: 'Standard rated supplies in Sharjah (5%)',
      titleAr: 'التوريدات الخاضعة للنسبة الأساسية في إمارة الشارقة (5%)',
      netAmountMinorUnits: '150000000', // AED 1,500,000.00
      vatAmountMinorUnits: '7500000', // AED 75,000.00
      adjustmentMinorUnits: '0',
      drilldownLines: [
        {
          voucherNumber: 'JV-2026-0099',
          date: '2026-02-11',
          counterparty: 'Air Arabia PJSC',
          counterpartyTrn: '100555666777888',
          description: 'Aviation catering supplies',
          netMinorUnits: '150000000',
          vatMinorUnits: '7500000'
        }
      ]
    },
    {
      boxNumber: '2',
      titleEn: 'Tax refunds provided to Tourists under Tax Refunds for Tourists Scheme',
      titleAr: 'المبالغ المستردة للسياح بموجب نظام رد الضريبة للسياح',
      netAmountMinorUnits: '0',
      vatAmountMinorUnits: '0',
      drilldownLines: []
    },
    {
      boxNumber: '3',
      titleEn: 'Supplies subject to Reverse Charge Mechanism (RCM - Art. 48)',
      titleAr: 'التوريدات الخاضعة لآلية الاحتساب العكسي (المادة 48)',
      netAmountMinorUnits: '160000000', // AED 1,600,000.00
      vatAmountMinorUnits: '8000000', // AED 80,000.00
      drilldownLines: [
        {
          voucherNumber: 'JV-2026-0002',
          date: '2026-01-20',
          counterparty: 'Amazon Web Services Inc. (Foreign Non-Resident)',
          counterpartyTrn: 'N/A - Foreign RCM',
          description: 'Cloud Infrastructure compute & databases',
          netMinorUnits: '160000000',
          vatMinorUnits: '8000000'
        }
      ]
    },
    {
      boxNumber: '4',
      titleEn: 'Zero-rated supplies (Article 45 & Designated Zone Exports)',
      titleAr: 'التوريدات الخاضعة لنسبة الصفر (المادة 45 وصادرات المناطق المحددة)',
      netAmountMinorUnits: '850000000', // AED 8,500,000.00
      vatAmountMinorUnits: '0',
      drilldownLines: [
        {
          voucherNumber: 'JV-2026-0065',
          date: '2026-02-05',
          counterparty: 'Saudi Telecom Company (STC - KSA Export)',
          counterpartyTrn: '300123456700003',
          description: 'Export of software licenses with customs exit certificate',
          netMinorUnits: '850000000',
          vatMinorUnits: '0'
        }
      ]
    },
    {
      boxNumber: '5',
      titleEn: 'Exempt supplies (Article 46 - Financial Services / Residential Bare Land)',
      titleAr: 'التوريدات المعفاة من الضريبة (المادة 46)',
      netAmountMinorUnits: '0',
      vatAmountMinorUnits: '0',
      drilldownLines: []
    },
    {
      boxNumber: '6',
      titleEn: 'Goods imported into the UAE through UAE Customs (Boxes 6 & 7)',
      titleAr: 'السلع المستوردة إلى دولة الإمارات عبر الجمارك',
      netAmountMinorUnits: '0',
      vatAmountMinorUnits: '0',
      drilldownLines: []
    },
    {
      boxNumber: '7',
      titleEn: 'Adjustments to goods imported into the UAE',
      titleAr: 'التعديلات على السلع المستوردة إلى دولة الإمارات',
      netAmountMinorUnits: '0',
      vatAmountMinorUnits: '0',
      drilldownLines: []
    },
    {
      boxNumber: '8',
      titleEn: 'Totals: Total Value of Due Tax for the Period (Output Tax)',
      titleAr: 'إجمالي قيمة الضريبة المستحقة للفترة (ضريبة المخرجات)',
      netAmountMinorUnits: '2580000000', // AED 25,800,000.00
      vatAmountMinorUnits: '129000000', // AED 1,290,000.00
      isTotalBox: true,
      drilldownLines: []
    },
    {
      boxNumber: '9',
      titleEn: 'Standard rated expenses (Recoverable Input VAT)',
      titleAr: 'المصروفات الخاضعة للنسبة الأساسية (ضريبة المدخلات القابلة للاسترداد)',
      netAmountMinorUnits: '1735000000', // AED 17,350,000.00
      vatAmountMinorUnits: '86750000', // AED 867,500.00
      recoverableVatMinorUnits: '86750000',
      drilldownLines: [
        {
          voucherNumber: 'BILL-2026-5501',
          date: '2026-01-12',
          counterparty: 'Amazon Data Services UAE LLC',
          counterpartyTrn: '100222333444555',
          description: 'AWS UAE me-central-1 dedicated server compute',
          netMinorUnits: '80000000',
          vatMinorUnits: '4000000'
        },
        {
          voucherNumber: 'BILL-2026-5502',
          date: '2026-01-22',
          counterparty: 'Cisco Systems Gulf FZ-LLC',
          counterpartyTrn: '100111222333444',
          description: 'Data center core networking equipment delivery',
          netMinorUnits: '250000000',
          vatMinorUnits: '12500000'
        },
        {
          voucherNumber: 'JV-2026-0033',
          date: '2026-01-08',
          counterparty: 'Emirates Integrated Telecommunications Company (du)',
          counterpartyTrn: '100000000000001',
          description: 'Fiber optics leased lines and enterprise telecoms',
          netMinorUnits: '1405000000',
          vatMinorUnits: '70250000'
        }
      ]
    },
    {
      boxNumber: '10',
      titleEn: 'Supplies subject to Reverse Charge Mechanism (Input Tax on RCM)',
      titleAr: 'التوريدات الخاضعة لآلية الاحتساب العكسي (ضريبة المدخلات على RCM)',
      netAmountMinorUnits: '160000000',
      vatAmountMinorUnits: '8000000',
      recoverableVatMinorUnits: '8000000',
      drilldownLines: [
        {
          voucherNumber: 'JV-2026-0002',
          date: '2026-01-20',
          counterparty: 'Amazon Web Services Inc.',
          counterpartyTrn: 'N/A - Foreign RCM',
          description: 'RCM Input VAT Recovery (contra to Box 3)',
          netMinorUnits: '160000000',
          vatMinorUnits: '8000000'
        }
      ]
    },
    {
      boxNumber: '11',
      titleEn: 'Totals: Total Value of Recoverable Tax for the Period (Input Tax)',
      titleAr: 'إجمالي قيمة الضريبة القابلة للاسترداد للفترة (ضريبة المدخلات)',
      netAmountMinorUnits: '1895000000',
      vatAmountMinorUnits: '94750000', // AED 947,500.00
      recoverableVatMinorUnits: '94750000',
      isTotalBox: true,
      drilldownLines: []
    },
    {
      boxNumber: '12',
      titleEn: 'Total payable tax for the period (Box 8 minus Box 11)',
      titleAr: 'إجمالي الضريبة المستحقة السداد للفترة',
      netAmountMinorUnits: '0',
      vatAmountMinorUnits: '34250000', // AED 342,500.00
      isTotalBox: true,
      drilldownLines: []
    },
    {
      boxNumber: '14',
      titleEn: 'Net VAT Payable (or Reclaimable) to Federal Tax Authority (FTA)',
      titleAr: 'صافي ضريبة القيمة المضافة المستحقة للهيئة الاتحادية للضرائب',
      netAmountMinorUnits: '0',
      vatAmountMinorUnits: '34250000', // AED 342,500.00
      isTotalBox: true,
      drilldownLines: []
    }
  ],
  summary: {
    totalOutputVatDueMinorUnits: '129000000', // AED 1,290,000.00
    totalRecoverableVatMinorUnits: '94750000', // AED 947,500.00
    payableTaxMinorUnits: '34250000', // AED 342,500.00
    reclaimedTaxMinorUnits: '0',
    netPayableTaxMinorUnits: '34250000' // AED 342,500.00
  }
};

export const GET = withAuth(Permission.LEDGER_READ)(async (request: NextRequest, _ctx) => {
  const { searchParams } = new URL(request.url);
  const boxNumber = searchParams.get('box');

  if (boxNumber) {
    const box = VAT201_DATA.boxes.find((b) => b.boxNumber === boxNumber);
    if (!box) return NextResponse.json({ error: 'Box not found' }, { status: 404 });
    return NextResponse.json({ box });
  }

  return NextResponse.json(VAT201_DATA);
});
