import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { seedUaeDemoCompany } from './seed-demo.js';

describe('Production Readiness: Realistic UAE Demo Company Bootstrapper', () => {
  test('Seeds complete bilingual multi-entity UAE group with balanced ledger vouchers', () => {
    const scenario = seedUaeDemoCompany();

    assert.equal(scenario.holdingCompanyNameEn, 'Falcon Gulf Holdings LLC');
    assert.equal(scenario.holdingCompanyNameAr, 'شركة صقر الخليج القابضة ش.ذ.م.م');
    assert.equal(scenario.entities.mainlandTrn, '100234567800003');
    assert.equal(scenario.entities.dmccTrn, '100987654321001');

    assert.equal(scenario.sampleVouchersCount, 2);
    assert.equal(scenario.isLedgerBalanced, true);
    assert.equal(scenario.vat201NetTaxPayableFils, 500000n); // AED 5,000.00
  });
});
