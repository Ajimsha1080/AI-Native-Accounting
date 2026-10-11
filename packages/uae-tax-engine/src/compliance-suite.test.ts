import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePartialExemption } from './partial-exemption.js';
import { calculateExciseTax, ExciseCategory } from './excise-tax.js';
import { evaluateDesignatedZoneGoodsSupply } from './designated-zones.js';

describe('UAE Tax Engine: Partial Exemption Input VAT Recovery', () => {
  test('Apportions input VAT accurately based on taxable vs exempt turnover', () => {
    // Taxable Supplies: AED 800,000 (80,000,000 fils)
    // Exempt Supplies: AED 200,000 (20,000,000 fils)
    // Total Supplies: AED 1,000,000 -> Ratio = 80.00% (8000 bps)
    // Residual Overhead VAT: AED 10,000 (1,000,000 fils)
    const result = calculatePartialExemption({
      taxableSuppliesFils: 80000000n,
      exemptSuppliesFils: 20000000n,
      residualInputVatFils: 1000000n
    });

    assert.equal(result.recoveryRatioBps, 8000n);
    assert.equal(result.recoverableVatFils, 800000n); // AED 8,000 recoverable
    assert.equal(result.blockedVatFils, 200000n);     // AED 2,000 blocked
    assert.equal(result.verifyWithTaxAdvisor, true);
  });
});

describe('UAE Tax Engine: Excise Tax Calculations', () => {
  test('Calculates 50% excise tax on carbonated/sweetened beverages', () => {
    // 100 cans @ AED 3.00 retail price = AED 300.00 (30,000 fils) -> 50% = AED 150.00 (15,000 fils)
    const res = calculateExciseTax({
      category: ExciseCategory.CARBONATED_DRINKS,
      designatedRetailPriceFils: 300n,
      quantity: 100n
    });
    assert.equal(res.exciseRatePercent, 50);
    assert.equal(res.totalTaxableValueFils, 30000n);
    assert.equal(res.exciseTaxDueFils, 15000n);
  });

  test('Calculates 100% excise tax on energy drinks and tobacco products', () => {
    // 50 packs @ AED 20.00 retail price = AED 1,000.00 (100,000 fils) -> 100% = AED 1,000.00 (100,000 fils)
    const res = calculateExciseTax({
      category: ExciseCategory.ENERGY_DRINKS,
      designatedRetailPriceFils: 2000n,
      quantity: 50n
    });
    assert.equal(res.exciseRatePercent, 100);
    assert.equal(res.exciseTaxDueFils, 100000n);
  });
});

describe('UAE Tax Engine: Designated Zone Goods Movement', () => {
  test('Transfer between two designated zones under customs perimeter is out of scope', () => {
    const res = evaluateDesignatedZoneGoodsSupply({
      isSourceDesignatedZone: true,
      isDestinationDesignatedZone: true,
      areGoodsConsumedWithinZone: false,
      isCustomsPerimeterMaintained: true,
      invoiceValueFils: 10000000n
    });
    assert.equal(res.isVatApplicable, false);
    assert.equal(res.treatmentCode, 'OUT_OF_SCOPE');
    assert.equal(res.verifyWithTaxAdvisor, true);
  });

  test('Goods consumed within a designated zone are standard rated 5%', () => {
    const res = evaluateDesignatedZoneGoodsSupply({
      isSourceDesignatedZone: true,
      isDestinationDesignatedZone: true,
      areGoodsConsumedWithinZone: true, // Consumed inside zone
      isCustomsPerimeterMaintained: true,
      invoiceValueFils: 500000n
    });
    assert.equal(res.isVatApplicable, true);
    assert.equal(res.treatmentCode, 'STANDARD_5');
    assert.equal(res.vatRateBps, 500);
  });

  test('Supply from Designated Zone to Mainland is treated as import with RCM', () => {
    const res = evaluateDesignatedZoneGoodsSupply({
      isSourceDesignatedZone: true,
      isDestinationDesignatedZone: false, // Mainland
      areGoodsConsumedWithinZone: false,
      isCustomsPerimeterMaintained: true,
      invoiceValueFils: 5000000n
    });
    assert.equal(res.treatmentCode, 'REVERSE_CHARGE_5');
    assert.equal(res.vatRateBps, 500);
  });
});
