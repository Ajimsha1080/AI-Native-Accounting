import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCorporateTax } from './corporate-tax.js';

describe('UAE Corporate Tax (Federal Decree-Law No. 47 of 2022)', () => {
  test('Standard Mainland Entity: 0% up to AED 375,000, 9% on excess profit with non-deductible add-backs', () => {
    // Net Accounting Profit: AED 1,000,000 (100,000,000 fils)
    // Non-deductible Entertainment: AED 50,000 (5,000,000 fils) -> 50% addback = 2,500,000 fils
    // Fines/Penalties: AED 10,000 (1,000,000 fils) -> 100% addback = 1,000,000 fils
    // Adjusted Taxable Income: 100M + 2.5M + 1M = 103,500,000 fils (AED 1,035,000.00)
    // Exemption Threshold: AED 375,000 (37,500,000 fils)
    // Taxable Excess: 103.5M - 37.5M = 66,000,000 fils (AED 660,000.00)
    // Tax Due @ 9%: 66,000,000 * 9% = 5,940,000 fils (AED 59,400.00)

    const result = calculateCorporateTax({
      entity: {
        entityId: 'ent-mainland-01',
        entityName: 'Dubai Trading LLC',
        isQualifyingFreeZonePerson: false,
        isSmallBusinessReliefElected: false
      },
      taxPeriodYear: 2025,
      grossRevenueFils: 500000000n, // AED 5M
      netAccountingProfitLossFils: 100000000n,
      entertainmentExpensesFils: 5000000n,
      penaltiesAndFinesFils: 1000000n,
      exemptDividendsReceivedFils: 0n,
      taxLossReliefBfwdFils: 0n
    });

    assert.equal(result.taxAdjustmentsAddBackFils, 3500000n); // 2.5M + 1M
    assert.equal(result.finalTaxableIncomeFils, 103500000n);
    assert.equal(result.taxDueFils, 5940000n); // AED 59,400.00
    assert.equal(result.verifyWithTaxAdvisor, true);
  });

  test('Qualifying Free Zone Person (QFZP): 0% rate applied when within de-minimis limits', () => {
    // Total Revenue: AED 10,000,000 (1,000,000,000 fils)
    // Qualifying Revenue: AED 9,800,000 (980,000,000 fils)
    // Non-Qualifying Revenue: AED 200,000 (20,000,000 fils) -> Ratio = 2.00% (200 bps <= 500 bps)
    // Satisfies QFZP De-Minimis -> 0% Corporate Tax

    const result = calculateCorporateTax({
      entity: {
        entityId: 'ent-dmcc-01',
        entityName: 'DMCC Commodities DMCC',
        isQualifyingFreeZonePerson: true,
        freeZoneName: 'DMCC',
        isSmallBusinessReliefElected: false
      },
      taxPeriodYear: 2025,
      grossRevenueFils: 1000000000n,
      netAccountingProfitLossFils: 200000000n, // AED 2M Profit
      qualifyingRevenueFils: 980000000n,
      nonQualifyingRevenueFils: 20000000n,
      entertainmentExpensesFils: 0n,
      penaltiesAndFinesFils: 0n,
      exemptDividendsReceivedFils: 0n,
      taxLossReliefBfwdFils: 0n
    });

    assert.equal(result.isQfzpDisqualified, false);
    assert.equal(result.qfzpDeMinimisRatioBps, 200n); // 2.00%
    assert.equal(result.taxDueFils, 0n); // 0% Tax applied
  });

  test('Article 37: Tax Loss carry-forward relief is strictly capped at 75% of taxable income', () => {
    // Taxable Income before losses: AED 1,000,000 (100,000,000 fils)
    // Brought forward losses available: AED 900,000 (90,000,000 fils)
    // Maximum loss allowed: 75% of 1,000,000 = AED 750,000 (75,000,000 fils)
    // Final Taxable Income = 100M - 75M = 25,000,000 fils (AED 250,000.00 <= 375k threshold -> 0 tax)

    const result = calculateCorporateTax({
      entity: {
        entityId: 'ent-loss-01',
        entityName: 'Abu Dhabi Logistics LLC',
        isQualifyingFreeZonePerson: false,
        isSmallBusinessReliefElected: false
      },
      taxPeriodYear: 2025,
      grossRevenueFils: 200000000n,
      netAccountingProfitLossFils: 100000000n,
      entertainmentExpensesFils: 0n,
      penaltiesAndFinesFils: 0n,
      exemptDividendsReceivedFils: 0n,
      taxLossReliefBfwdFils: 90000000n // 900k available
    });

    assert.equal(result.utilizedTaxLossFils, 75000000n); // Capped at exactly 75%
    assert.equal(result.finalTaxableIncomeFils, 25000000n); // AED 250k
    assert.equal(result.taxDueFils, 0n); // Under 375k threshold
  });
});
