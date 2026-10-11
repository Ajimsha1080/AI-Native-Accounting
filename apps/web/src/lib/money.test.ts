import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatMinorUnits } from './money.ts';

describe('Shared Zero-Float Money Formatter', () => {
  test('Formats standard positive AED fils into English notation', () => {
    const formatted = formatMinorUnits(1845000000n, { locale: 'en' });
    assert.equal(formatted, 'AED 18,450,000.00');
  });

  test('Formats positive AED fils into Arabic notation with Eastern Arabic digits', () => {
    const formatted = formatMinorUnits(34250000n, { locale: 'ar', numeralSystem: 'arab' });
    assert.equal(formatted, '٣٤٢٬٥٠٠٫٠٠ د.إ');
  });

  test('Formats negative balances cleanly without floating point precision decay', () => {
    const formatted = formatMinorUnits(-50000n, { locale: 'en' });
    assert.equal(formatted, 'AED -500.00');
  });

  test('Omits currency symbol when configured', () => {
    const formatted = formatMinorUnits(10050n, { locale: 'en', showCurrencySymbol: false });
    assert.equal(formatted, '100.50');
  });
});
