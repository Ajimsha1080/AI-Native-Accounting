import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateVat201Return } from './vat201.js';
import { UAE_TAX_RULES } from './rules.js';

describe('UAE Tax Engine: VAT 201 Calculations & Rules', () => {
  test('All rules have legal reference and explicit verification flag', () => {
    for (const rule of UAE_TAX_RULES) {
      assert.ok(rule.ruleId, 'Rule must have an ID');
      assert.ok(rule.lawReference, `Rule ${rule.ruleId} must cite UAE Law`);
      assert.equal(typeof rule.verifyWithTaxAdvisor, 'boolean');
    }
  });

  test('Calculates VAT 201 Return with Standard 5%, Zero-Rated, and RCM correctly', () => {
    // Scenario:
    // Standard Sales: AED 100,000.00 (10,000,000 fils) -> VAT = AED 5,000.00 (500,000 fils)
    // Reverse Charge Service Import: AED 20,000.00 (2,000,000 fils) -> VAT = AED 1,000.00 (100,000 fils)
    // Zero Rated Export: AED 50,000.00 (5,000,000 fils) -> VAT = AED 0.00
    const sampleLines = [
      { taxCode: 'SR_5', netAmountBase: 10000000n },
      { taxCode: 'RCM_5', netAmountBase: 2000000n, isRecoverable: true },
      { taxCode: 'ZR_EXP_0', netAmountBase: 5000000n }
    ];

    const vatReturn = calculateVat201Return('100234567800003', '2026-Q1', sampleLines);

    // Box 1: AED 5,000.00 (500,000 fils)
    const box1 = vatReturn.boxes.find((b) => b.boxNumber === 1);
    assert.ok(box1);
    assert.equal(box1.vatAmountBase, 500000n);

    // Box 3: Reverse charge AED 1,000.00 (100,000 fils)
    const box3 = vatReturn.boxes.find((b) => b.boxNumber === 3);
    assert.ok(box3);
    assert.equal(box3.vatAmountBase, 100000n);

    // Box 9: Total Output Tax = 5,000 + 1,000 = AED 6,000.00 (600,000 fils)
    assert.equal(vatReturn.totalOutputTax, 600000n);

    // Box 10: Input Tax Recovered (RCM recoverable portion) = AED 1,000.00 (100,000 fils)
    assert.equal(vatReturn.totalInputTax, 100000n);

    // Net Tax Payable to FTA: 6,000 - 1,000 = AED 5,000.00 (500,000 fils)
    assert.equal(vatReturn.netTaxPayableOrReclaimable, 500000n);
  });
});
