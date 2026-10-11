import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { Permission } from '@ledger-ae/shared-types';

export interface ReportLine {
  accountCode: string;
  nameEn: string;
  nameAr: string;
  category: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  debitMinorUnits: string; // fils
  creditMinorUnits: string; // fils
  netBalanceMinorUnits: string; // fils
}

export interface ConsolidationEntityColumn {
  entityId: string;
  nameEn: string;
  nameAr: string;
  currency: string;
  debitMinorUnits: string;
  creditMinorUnits: string;
}

export interface FinancialReportData {
  reportType: 'TRIAL_BALANCE' | 'PNL' | 'BALANCE_SHEET' | 'CONSOLIDATION';
  period: string;
  generatedAt: string;
  currency: string;
  trialBalance: {
    lines: ReportLine[];
    totalDebitMinorUnits: string;
    totalCreditMinorUnits: string;
    isBalanced: boolean;
    varianceFils: string;
  };
  pnl: {
    revenueLines: ReportLine[];
    expenseLines: ReportLine[];
    totalRevenueMinorUnits: string;
    totalExpenseMinorUnits: string;
    netProfitMinorUnits: string;
  };
  balanceSheet: {
    assetLines: ReportLine[];
    liabilityLines: ReportLine[];
    equityLines: ReportLine[];
    totalAssetsMinorUnits: string;
    totalLiabilitiesAndEquityMinorUnits: string;
    isBalanced: boolean;
  };
  consolidation: {
    entities: ConsolidationEntityColumn[];
    intercompanyEliminationsMinorUnits: string;
    consolidatedTotalMinorUnits: string;
  };
}

const REPORT_DATA: FinancialReportData = {
  reportType: 'TRIAL_BALANCE',
  period: 'FY 2026 - P01 (01 Jan 2026 - 31 Jan 2026)',
  generatedAt: new Date().toISOString(),
  currency: 'AED',
  trialBalance: {
    totalDebitMinorUnits: '9788020000', // AED 97,880,200.00
    totalCreditMinorUnits: '9788020000', // AED 97,880,200.00
    isBalanced: true,
    varianceFils: '0',
    lines: [
      { accountCode: '1010', nameEn: 'Cash on Hand & Petty Cash', nameAr: 'النقد في الصندوق والعهدة النثرية', category: 'ASSET', debitMinorUnits: '2500000', creditMinorUnits: '0', netBalanceMinorUnits: '2500000' },
      { accountCode: '1020', nameEn: 'Emirates NBD - Operating (AED)', nameAr: 'بنك الإمارات دبي الوطني - الحساب الجاري', category: 'ASSET', debitMinorUnits: '1240000000', creditMinorUnits: '0', netBalanceMinorUnits: '1240000000' },
      { accountCode: '1030', nameEn: 'ADCB - Treasury & Tax (AED)', nameAr: 'بنك أبوظبي التجاري - حساب الخزينة والضرائب', category: 'ASSET', debitMinorUnits: '605000000', creditMinorUnits: '0', netBalanceMinorUnits: '605000000' },
      { accountCode: '1200', nameEn: 'Trade Accounts Receivable (AR)', nameAr: 'ذمم مدينة تجارية (العملاء)', category: 'ASSET', debitMinorUnits: '624000000', creditMinorUnits: '0', netBalanceMinorUnits: '624000000' },
      { accountCode: '1300', nameEn: 'Input VAT Recoverable (Box 9)', nameAr: 'ضريبة المدخلات القابلة للاسترداد', category: 'ASSET', debitMinorUnits: '94750000', creditMinorUnits: '0', netBalanceMinorUnits: '94750000' },
      { accountCode: '2010', nameEn: 'Trade Accounts Payable (AP)', nameAr: 'ذمم دائنة تجارية (الموردون)', category: 'LIABILITY', debitMinorUnits: '0', creditMinorUnits: '412000000', netBalanceMinorUnits: '-412000000' },
      { accountCode: '2110', nameEn: 'Output VAT Payable (Box 1)', nameAr: 'ضريبة المخرجات المستحقة للدولة', category: 'LIABILITY', debitMinorUnits: '0', creditMinorUnits: '129000000', netBalanceMinorUnits: '-129000000' },
      { accountCode: '2200', nameEn: 'Corporate Tax 9% Provision (Art. 47)', nameAr: 'مخصص ضريبة الشركات 9%', category: 'LIABILITY', debitMinorUnits: '0', creditMinorUnits: '18500000', netBalanceMinorUnits: '-18500000' },
      { accountCode: '2300', nameEn: 'Article 51 EOSG Gratuity Provision', nameAr: 'مخصص مكافأة نهاية الخدمة (المادة 51)', category: 'LIABILITY', debitMinorUnits: '0', creditMinorUnits: '45000000', netBalanceMinorUnits: '-45000000' },
      { accountCode: '3010', nameEn: 'Share Capital', nameAr: 'رأس المال المصرح به والمدفوع', category: 'EQUITY', debitMinorUnits: '0', creditMinorUnits: '1500000000', netBalanceMinorUnits: '-1500000000' },
      { accountCode: '3200', nameEn: 'Retained Earnings', nameAr: 'الأرباح المدورة (المحتجزة)', category: 'EQUITY', debitMinorUnits: '0', creditMinorUnits: '488750000', netBalanceMinorUnits: '-488750000' },
      { accountCode: '4010', nameEn: 'Commercial Sales Revenue (Standard 5%)', nameAr: 'إيرادات المبيعات التجارية (خاضعة 5%)', category: 'REVENUE', debitMinorUnits: '0', creditMinorUnits: '2270000000', netBalanceMinorUnits: '-2270000000' },
      { accountCode: '4020', nameEn: 'Zero-Rated Export Revenue (Article 45)', nameAr: 'إيرادات التصدير بنسبة الصفر (المادة 45)', category: 'REVENUE', debitMinorUnits: '0', creditMinorUnits: '850000000', netBalanceMinorUnits: '-850000000' },
      { accountCode: '5010', nameEn: 'Cost of Goods Sold (COGS)', nameAr: 'تكلفة البضاعة المباعة', category: 'EXPENSE', debitMinorUnits: '1350000000', creditMinorUnits: '0', netBalanceMinorUnits: '1350000000' },
      { accountCode: '5100', nameEn: 'Staff Salaries & WPS Allowances', nameAr: 'رواتب الموظفين وبدلات حماية الأجور (WPS)', category: 'EXPENSE', debitMinorUnits: '320000000', creditMinorUnits: '0', netBalanceMinorUnits: '320000000' },
      { accountCode: '5200', nameEn: 'Office Rent & Commercial Leases (IFRS 16)', nameAr: 'إيجار المكاتب وعقود التأجير', category: 'EXPENSE', debitMinorUnits: '110000000', creditMinorUnits: '0', netBalanceMinorUnits: '110000000' }
    ]
  },
  pnl: {
    totalRevenueMinorUnits: '3120000000', // AED 31,200,000.00
    totalExpenseMinorUnits: '1780000000', // AED 17,800,000.00
    netProfitMinorUnits: '1340000000', // AED 13,400,000.00
    revenueLines: [
      { accountCode: '4010', nameEn: 'Commercial Sales Revenue (Standard 5%)', nameAr: 'إيرادات المبيعات التجارية (خاضعة 5%)', category: 'REVENUE', debitMinorUnits: '0', creditMinorUnits: '2270000000', netBalanceMinorUnits: '2270000000' },
      { accountCode: '4020', nameEn: 'Zero-Rated Export Revenue (Article 45)', nameAr: 'إيرادات التصدير بنسبة الصفر (المادة 45)', category: 'REVENUE', debitMinorUnits: '0', creditMinorUnits: '850000000', netBalanceMinorUnits: '850000000' }
    ],
    expenseLines: [
      { accountCode: '5010', nameEn: 'Cost of Goods Sold (COGS)', nameAr: 'تكلفة البضاعة المباعة', category: 'EXPENSE', debitMinorUnits: '1350000000', creditMinorUnits: '0', netBalanceMinorUnits: '1350000000' },
      { accountCode: '5100', nameEn: 'Staff Salaries & WPS Allowances', nameAr: 'رواتب الموظفين وبدلات حماية الأجور (WPS)', category: 'EXPENSE', debitMinorUnits: '320000000', creditMinorUnits: '0', netBalanceMinorUnits: '320000000' },
      { accountCode: '5200', nameEn: 'Office Rent & Leases (IFRS 16)', nameAr: 'إيجار المكاتب وعقود التأجير', category: 'EXPENSE', debitMinorUnits: '110000000', creditMinorUnits: '0', netBalanceMinorUnits: '110000000' }
    ]
  },
  balanceSheet: {
    totalAssetsMinorUnits: '2566250000', // AED 25,662,500.00
    totalLiabilitiesAndEquityMinorUnits: '2566250000', // AED 25,662,500.00
    isBalanced: true,
    assetLines: [
      { accountCode: '1010', nameEn: 'Cash on Hand & Petty Cash', nameAr: 'النقد في الصندوق والعهدة النثرية', category: 'ASSET', debitMinorUnits: '2500000', creditMinorUnits: '0', netBalanceMinorUnits: '2500000' },
      { accountCode: '1020', nameEn: 'Emirates NBD - Operating (AED)', nameAr: 'بنك الإمارات دبي الوطني - الحساب الجاري', category: 'ASSET', debitMinorUnits: '1240000000', creditMinorUnits: '0', netBalanceMinorUnits: '1240000000' },
      { accountCode: '1030', nameEn: 'ADCB - Treasury & Tax (AED)', nameAr: 'بنك أبوظبي التجاري - حساب الخزينة والضرائب', category: 'ASSET', debitMinorUnits: '605000000', creditMinorUnits: '0', netBalanceMinorUnits: '605000000' },
      { accountCode: '1200', nameEn: 'Trade Accounts Receivable (AR)', nameAr: 'ذمم مدينة تجارية (العملاء)', category: 'ASSET', debitMinorUnits: '624000000', creditMinorUnits: '0', netBalanceMinorUnits: '624000000' },
      { accountCode: '1300', nameEn: 'Input VAT Recoverable (Box 9)', nameAr: 'ضريبة المدخلات القابلة للاسترداد', category: 'ASSET', debitMinorUnits: '94750000', creditMinorUnits: '0', netBalanceMinorUnits: '94750000' }
    ],
    liabilityLines: [
      { accountCode: '2010', nameEn: 'Trade Accounts Payable (AP)', nameAr: 'ذمم دائنة تجارية (الموردون)', category: 'LIABILITY', debitMinorUnits: '0', creditMinorUnits: '412000000', netBalanceMinorUnits: '412000000' },
      { accountCode: '2110', nameEn: 'Output VAT Payable (Box 1)', nameAr: 'ضريبة المخرجات المستحقة للدولة', category: 'LIABILITY', debitMinorUnits: '0', creditMinorUnits: '129000000', netBalanceMinorUnits: '129000000' },
      { accountCode: '2200', nameEn: 'Corporate Tax 9% Provision (Art. 47)', nameAr: 'مخصص ضريبة الشركات 9%', category: 'LIABILITY', debitMinorUnits: '0', creditMinorUnits: '18500000', netBalanceMinorUnits: '18500000' },
      { accountCode: '2300', nameEn: 'Article 51 EOSG Gratuity Provision', nameAr: 'مخصص مكافأة نهاية الخدمة (المادة 51)', category: 'LIABILITY', debitMinorUnits: '0', creditMinorUnits: '45000000', netBalanceMinorUnits: '45000000' }
    ],
    equityLines: [
      { accountCode: '3010', nameEn: 'Share Capital', nameAr: 'رأس المال المصرح به والمدفوع', category: 'EQUITY', debitMinorUnits: '0', creditMinorUnits: '1500000000', netBalanceMinorUnits: '1500000000' },
      { accountCode: '3200', nameEn: 'Retained Earnings', nameAr: 'الأرباح المدورة (المحتجزة)', category: 'EQUITY', debitMinorUnits: '0', creditMinorUnits: '461750000', netBalanceMinorUnits: '461750000' }
    ]
  },
  consolidation: {
    intercompanyEliminationsMinorUnits: '-350000000', // AED 3.5M
    consolidatedTotalMinorUnits: '9788020000',
    entities: [
      { entityId: 'mainland', nameEn: 'Al-Noor Trading LLC (Mainland)', nameAr: 'شركة النور للتجارة ذ.م.م (دبي)', currency: 'AED', debitMinorUnits: '4250000000', creditMinorUnits: '4250000000' },
      { entityId: 'dmcc', nameEn: 'Al-Noor Tech DMCC (Free Zone)', nameAr: 'النور للتقنية م.د.م.س', currency: 'AED', debitMinorUnits: '2100000000', creditMinorUnits: '2100000000' },
      { entityId: 'jafza', nameEn: 'Al-Noor Logistics FZE (JAFZA QFZP)', nameAr: 'النور للخدمات اللوجستية (جافزا)', currency: 'AED', debitMinorUnits: '1850000000', creditMinorUnits: '1850000000' },
      { entityId: 'difc', nameEn: 'Al-Noor Capital Partners Ltd (DIFC)', nameAr: 'النور كابيتال بارتنرز (مركز دبي المالي)', currency: 'USD', debitMinorUnits: '1588020000', creditMinorUnits: '1588020000' }
    ]
  }
};

export const GET = withAuth(Permission.LEDGER_READ)(async (request: NextRequest, _ctx) => {
  const { searchParams } = new URL(request.url);
  const type = (searchParams.get('type') || 'TRIAL_BALANCE') as 'TRIAL_BALANCE' | 'PNL' | 'BALANCE_SHEET' | 'CONSOLIDATION';

  return NextResponse.json({
    ...REPORT_DATA,
    reportType: type
  });
});
