import { LanguageLocale } from '@ledger-ae/shared-types';
import { formatMoney } from '@ledger-ae/ledger-core';

export interface DenseGridColumn<T> {
  id: string;
  headerEn: string;
  headerAr: string;
  widthPx: number;
  align: 'left' | 'right' | 'center';
  accessor: (row: T) => string;
}

export interface JournalRowViewModel {
  voucherNumber: string;
  date: string;
  accountCode: string;
  accountNameEn: string;
  accountNameAr: string;
  memoEn: string;
  memoAr: string;
  debitFils: bigint;
  creditFils: bigint;
  vatCode?: string;
}

/**
 * Dense Table Model for High-Performance Ledger Browsing
 * Emulates TanStack Table column definitions with RTL-aware alignment.
 */
export function getJournalTableColumns(locale: LanguageLocale): DenseGridColumn<JournalRowViewModel>[] {
  const isRtl = locale === LanguageLocale.AR;

  return [
    {
      id: 'voucherNumber',
      headerEn: 'Voucher #',
      headerAr: 'رقم القيد',
      widthPx: 140,
      align: isRtl ? 'right' : 'left',
      accessor: (r) => r.voucherNumber
    },
    {
      id: 'date',
      headerEn: 'Posting Date',
      headerAr: 'تاريخ الترحيل',
      widthPx: 120,
      align: 'center',
      accessor: (r) => r.date
    },
    {
      id: 'account',
      headerEn: 'Account',
      headerAr: 'الحساب',
      widthPx: 220,
      align: isRtl ? 'right' : 'left',
      accessor: (r) => `${r.accountCode} - ${isRtl ? r.accountNameAr : r.accountNameEn}`
    },
    {
      id: 'debit',
      headerEn: 'Debit (AED)',
      headerAr: 'مدين (د.إ)',
      widthPx: 130,
      align: isRtl ? 'left' : 'right',
      accessor: (r) => (r.debitFils > 0n ? formatMoney(r.debitFils, 'AED') : '-')
    },
    {
      id: 'credit',
      headerEn: 'Credit (AED)',
      headerAr: 'دائن (د.إ)',
      widthPx: 130,
      align: isRtl ? 'left' : 'right',
      accessor: (r) => (r.creditFils > 0n ? formatMoney(r.creditFils, 'AED') : '-')
    },
    {
      id: 'vatCode',
      headerEn: 'VAT Code',
      headerAr: 'رمز الضريبة',
      widthPx: 100,
      align: 'center',
      accessor: (r) => r.vatCode ?? '-'
    }
  ];
}
