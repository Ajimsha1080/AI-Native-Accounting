import { getRequestConfig } from 'next-intl/server';
import { LanguageLocale } from '@ledger-ae/shared-types';

export function getLocalizationConfig(locale: LanguageLocale) {
  const isRtl = locale === LanguageLocale.AR;
  return {
    locale,
    isRtl,
    currencyDisplay: isRtl ? 'د.إ' : 'AED',
    direction: isRtl ? 'rtl' : 'ltr'
  };
}

const DICTIONARY: Record<string, Record<LanguageLocale, string>> = {
  generalLedger: {
    [LanguageLocale.EN]: 'General Ledger',
    [LanguageLocale.AR]: 'دفتر الأستاذ العام'
  },
  vat201Return: {
    [LanguageLocale.EN]: 'VAT 201 Return',
    [LanguageLocale.AR]: 'إقرار ضريبة القيمة المضافة (نموذج 201)'
  }
};

export function translate(key: string, locale: LanguageLocale): string {
  return DICTIONARY[key]?.[locale] || key;
}

export default getRequestConfig(async ({ locale }) => {
  const currentLocale = locale && ['en', 'ar'].includes(locale) ? locale : 'en';
  return {
    locale: currentLocale,
    messages: (await import(`../messages/${currentLocale}.json`)).default
  };
});
