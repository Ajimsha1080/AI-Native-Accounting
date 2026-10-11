import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { Permission } from '@ledger-ae/shared-types';

export interface AccountItem {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  category: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  balanceMinorUnits: string; // integer fils
  isActive: boolean;
  currency: string;
}

const ACCOUNTS: AccountItem[] = [
  { id: 'acc-1010', code: '1010', nameEn: 'Cash on Hand & Petty Cash', nameAr: 'النقد في الصندوق والعهدة النثرية', category: 'ASSET', balanceMinorUnits: '2500000', isActive: true, currency: 'AED' },
  { id: 'acc-1020', code: '1020', nameEn: 'Emirates NBD - Operating (AED)', nameAr: 'بنك الإمارات دبي الوطني - الحساب الجاري', category: 'ASSET', balanceMinorUnits: '1240000000', isActive: true, currency: 'AED' },
  { id: 'acc-1030', code: '1030', nameEn: 'ADCB - Treasury & Tax (AED)', nameAr: 'بنك أبوظبي التجاري - حساب الخزينة والضرائب', category: 'ASSET', balanceMinorUnits: '605000000', isActive: true, currency: 'AED' },
  { id: 'acc-1200', code: '1200', nameEn: 'Trade Accounts Receivable (AR)', nameAr: 'ذمم مدينة تجارية (العملاء)', category: 'ASSET', balanceMinorUnits: '624000000', isActive: true, currency: 'AED' },
  { id: 'acc-1300', code: '1300', nameEn: 'Input VAT Recoverable (Box 9)', nameAr: 'ضريبة المدخلات القابلة للاسترداد', category: 'ASSET', balanceMinorUnits: '94750000', isActive: true, currency: 'AED' },
  { id: 'acc-2010', code: '2010', nameEn: 'Trade Accounts Payable (AP)', nameAr: 'ذمم دائنة تجارية (الموردون)', category: 'LIABILITY', balanceMinorUnits: '412000000', isActive: true, currency: 'AED' },
  { id: 'acc-2110', code: '2110', nameEn: 'Output VAT Payable (Box 1)', nameAr: 'ضريبة المخرجات المستحقة للدولة', category: 'LIABILITY', balanceMinorUnits: '129000000', isActive: true, currency: 'AED' },
  { id: 'acc-2200', code: '2200', nameEn: 'Corporate Tax 9% Provision (Art. 47)', nameAr: 'مخصص ضريبة الشركات 9%', category: 'LIABILITY', balanceMinorUnits: '18500000', isActive: true, currency: 'AED' },
  { id: 'acc-2300', code: '2300', nameEn: 'Article 51 EOSG Gratuity Provision', nameAr: 'مخصص مكافأة نهاية الخدمة (المادة 51)', category: 'LIABILITY', balanceMinorUnits: '45000000', isActive: true, currency: 'AED' },
  { id: 'acc-3010', code: '3010', nameEn: 'Share Capital', nameAr: 'رأس المال المصرح به والمدفوع', category: 'EQUITY', balanceMinorUnits: '1500000000', isActive: true, currency: 'AED' },
  { id: 'acc-3200', code: '3200', nameEn: 'Retained Earnings', nameAr: 'الأرباح المدورة (المحتجزة)', category: 'EQUITY', balanceMinorUnits: '488750000', isActive: true, currency: 'AED' },
  { id: 'acc-4010', code: '4010', nameEn: 'Commercial Sales Revenue (Standard 5%)', nameAr: 'إيرادات المبيعات التجارية (خاضعة 5%)', category: 'REVENUE', balanceMinorUnits: '2270000000', isActive: true, currency: 'AED' },
  { id: 'acc-4020', code: '4020', nameEn: 'Zero-Rated Export Revenue (Article 45)', nameAr: 'إيرادات التصدير بنسبة الصفر (المادة 45)', category: 'REVENUE', balanceMinorUnits: '850000000', isActive: true, currency: 'AED' },
  { id: 'acc-5010', code: '5010', nameEn: 'Cost of Goods Sold (COGS)', nameAr: 'تكلفة البضاعة المباعة', category: 'EXPENSE', balanceMinorUnits: '1350000000', isActive: true, currency: 'AED' },
  { id: 'acc-5100', code: '5100', nameEn: 'Staff Salaries & WPS Allowances', nameAr: 'رواتب الموظفين وبدلات حماية الأجور (WPS)', category: 'EXPENSE', balanceMinorUnits: '320000000', isActive: true, currency: 'AED' },
  { id: 'acc-5200', code: '5200', nameEn: 'Office Rent & Commercial Leases (IFRS 16)', nameAr: 'إيجار المكاتب وعقود التأجير', category: 'EXPENSE', balanceMinorUnits: '110000000', isActive: true, currency: 'AED' }
];

export const GET = withAuth(Permission.LEDGER_READ)(async (request: NextRequest, _ctx) => {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('q')?.toLowerCase();

  let filtered = [...ACCOUNTS];
  if (search) {
    filtered = filtered.filter(
      (a) =>
        a.code.includes(search) ||
        a.nameEn.toLowerCase().includes(search) ||
        a.nameAr.includes(search)
    );
  }

  return NextResponse.json({
    accounts: filtered,
    total: filtered.length
  });
});
