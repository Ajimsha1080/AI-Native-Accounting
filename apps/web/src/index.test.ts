import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LanguageLocale } from '@ledger-ae/shared-types';
import { getLocalizationConfig, translate } from './i18n.js';
import { getJournalTableColumns, JournalRowViewModel } from './table.js';

describe('Web UI: RTL, Arabic Localization & Dense Table Model', () => {
  test('Arabic configuration activates RTL and correct AED symbol', () => {
    const configAr = getLocalizationConfig(LanguageLocale.AR);
    assert.equal(configAr.isRtl, true);
    assert.equal(configAr.currencyDisplay, 'د.إ');

    const configEn = getLocalizationConfig(LanguageLocale.EN);
    assert.equal(configEn.isRtl, false);
    assert.equal(configEn.currencyDisplay, 'AED');
  });

  test('Translations return correct bilingual accounting terminology', () => {
    assert.equal(translate('generalLedger', LanguageLocale.EN), 'General Ledger');
    assert.equal(translate('generalLedger', LanguageLocale.AR), 'دفتر الأستاذ العام');
    assert.equal(translate('vat201Return', LanguageLocale.AR), 'إقرار ضريبة القيمة المضافة (نموذج 201)');
  });

  test('Dense grid columns adjust text alignment dynamically for RTL', () => {
    const sampleRow: JournalRowViewModel = {
      voucherNumber: 'JV-2026-001',
      date: '2026-01-31',
      accountCode: '10100',
      accountNameEn: 'Cash at Bank - FAB',
      accountNameAr: 'النقد في البنك - بنك أبوظبي الأول',
      memoEn: 'Supplier payment',
      memoAr: 'سداد للمورد',
      debitFils: 5000000n, // AED 50,000.00
      creditFils: 0n,
      vatCode: 'SR_5'
    };

    const columnsAr = getJournalTableColumns(LanguageLocale.AR);
    const voucherColAr = columnsAr.find((c) => c.id === 'voucherNumber');
    assert.equal(voucherColAr?.align, 'right'); // RTL right align

    const debitColAr = columnsAr.find((c) => c.id === 'debit');
    assert.equal(debitColAr?.accessor(sampleRow), '50000.00');

    const columnsEn = getJournalTableColumns(LanguageLocale.EN);
    const voucherColEn = columnsEn.find((c) => c.id === 'voucherNumber');
    assert.equal(voucherColEn?.align, 'left'); // LTR left align
  });
});
