import { LanguageLocale, LocalizationConfig } from '@ledger-ae/shared-types';

export const DICTIONARY = {
  en: {
    dashboard: 'Financial Dashboard',
    generalLedger: 'General Ledger',
    journalEntries: 'Journal Entries',
    vat201Return: 'FTA VAT 201 Return',
    continuousClose: 'Continuous Close Checklist',
    newEntry: 'Post Journal Voucher',
    debits: 'Debits',
    credits: 'Credits',
    balance: 'Balance',
    status: 'Status',
    verified: 'AI Verified',
    requiresApproval: 'Requires Approval',
    advisorWarning: 'Requires UAE Tax Advisor Review',
    currency: 'AED'
  },
  ar: {
    dashboard: 'لوحة التحكم المالية',
    generalLedger: 'دفتر الأستاذ العام',
    journalEntries: 'قيود اليومية',
    vat201Return: 'إقرار ضريبة القيمة المضافة (نموذج 201)',
    continuousClose: 'قائمة إقفال الفترة المستمر',
    newEntry: 'ترحيل قيد يومية',
    debits: 'مدين',
    credits: 'دائن',
    balance: 'الرصيد',
    status: 'الحالة',
    verified: 'تم التحقق بواسطة الذكاء الاصطناعي',
    requiresApproval: 'يتطلب موافقة',
    advisorWarning: 'يتطلب مراجعة المستشار الضريبي',
    currency: 'د.إ'
  }
} as const;

export function getLocalizationConfig(locale: LanguageLocale): LocalizationConfig {
  const isRtl = locale === LanguageLocale.AR;
  return {
    locale,
    isRtl,
    calendar: 'gregorian',
    currencyDisplay: isRtl ? 'د.إ' : 'AED'
  };
}

export function translate(key: keyof typeof DICTIONARY['en'], locale: LanguageLocale): string {
  return DICTIONARY[locale]?.[key] ?? DICTIONARY.en[key];
}
