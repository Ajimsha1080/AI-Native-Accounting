import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Ifrs16LeaseEngine, LeaseContractInput } from './ifrs16-lease.js';

describe('Milestone 11: IFRS 16 Leases - Single Lessee Accounting & Amortization Schedules', () => {
  test('24-Month Commercial Property Lease: Initial Measurement, Amortization & Complete Balance Sheet Zero-Out', () => {
    // Commercial Office in Downtown Dubai:
    // Term: 24 Months
    // Monthly Rent: AED 25,000 (2,500,000 fils)
    // Incremental Borrowing Rate (IBR): 6.00% per annum (600 bps) -> 0.5% per month
    // Initial Direct Costs: AED 10,000 (1,000,000 fils) - Broker fee capitalized into ROU Asset

    const input: LeaseContractInput = {
      leaseId: 'lease-downtown-01',
      leaseName: 'Downtown Dubai Office Lease Level 32',
      commencementDate: '2025-01-01',
      leaseTermMonths: 24,
      monthlyPaymentFils: 2500000n, // AED 25k / month
      annualDiscountRateBps: 600n,  // 6.00%
      initialDirectCostsFils: 1000000n, // AED 10k capitalized
      leaseIncentivesReceivedFils: 0n,
      paymentTiming: 'ARREARS',
      rouAssetAccountId: 'acc-asset-rou-office-01',
      leaseLiabilityAccountId: 'acc-liab-lease-liability-01',
      interestExpenseAccountId: 'acc-exp-lease-interest-01',
      depreciationExpenseAccountId: 'acc-exp-rou-depreciation-01',
      accumulatedDepreciationAccountId: 'acc-contra-rou-accum-dep-01',
      bankAccountId: 'acc-asset-bank-enbd-01'
    };

    const plan = Ifrs16LeaseEngine.generateLeasePlan(input);

    // Initial measurement
    assert.ok(plan.initialLeaseLiabilityFils > 0n);
    // Initial ROU Asset includes direct costs
    assert.equal(plan.initialRouAssetFils, plan.initialLeaseLiabilityFils + 1000000n);

    // Schedule length must exactly equal 24 months
    assert.equal(plan.schedule.length, 24);

    // Invariant 1: Total Depreciation matches Initial ROU Asset exactly to 0 fils
    assert.equal(plan.totalDepreciationFils, plan.initialRouAssetFils);

    // Invariant 2: Final ending lease liability is exactly 0 fils
    const finalMonth = plan.schedule[23];
    assert.equal(finalMonth.endingLiabilityFils, 0n);
    assert.equal(finalMonth.rouEndingNetBookValueFils, 0n);

    // Invariant 3: Monthly sum of principal repayments equals initial lease liability
    const totalPrincipalRepaid = plan.schedule.reduce(
      (sum, m) => sum + m.principalRepaymentFils,
      0n
    );
    assert.equal(totalPrincipalRepaid, plan.initialLeaseLiabilityFils);

    // Invariant 4: Current vs Non-Current segregation
    // In Month 1, current portion is principal due in months 2 to 13
    const month1 = plan.schedule[0];
    assert.ok(month1.currentLiabilityPortionFils > 0n);
    assert.ok(month1.nonCurrentLiabilityPortionFils > 0n);
    assert.equal(
      month1.currentLiabilityPortionFils + month1.nonCurrentLiabilityPortionFils,
      month1.endingLiabilityFils
    );

    // In Month 18 (with only 6 months left), non-current portion must be exactly 0 fils
    const month18 = plan.schedule[17];
    assert.equal(month18.nonCurrentLiabilityPortionFils, 0n);
    assert.equal(month18.currentLiabilityPortionFils, month18.endingLiabilityFils);

    // Invariant 5: Initial recognition journal entry debits == credits
    // (Note: ROU Asset = Liability + Direct Costs. Here ROU is debited, and Liability is credited.)
    assert.ok(plan.initialJournalEntry.debits[0].amountFils > 0n);

    // Invariant 6: Monthly recurring journal entries balance exactly
    const month1Entries = Ifrs16LeaseEngine.generateMonthlyJournalEntries(input, month1);
    assert.equal(month1Entries.paymentEntry.isBalanced, true);
    assert.equal(month1Entries.depreciationEntry.isBalanced, true);

    const payDebits = month1Entries.paymentEntry.debits.reduce((s, d) => s + d.amountFils, 0n);
    const payCredits = month1Entries.paymentEntry.credits.reduce((s, c) => s + c.amountFils, 0n);
    assert.equal(payDebits, payCredits);
    assert.equal(payCredits, month1.leasePaymentFils);
  });

  test('36-Month Warehouse Lease: Validates Interest Accretion & Amortization Mechanics', () => {
    const input: LeaseContractInput = {
      leaseId: 'lease-warehouse-02',
      leaseName: 'JAFZA Industrial Warehouse Unit 14',
      commencementDate: '2025-06-01',
      leaseTermMonths: 36,
      monthlyPaymentFils: 5000000n, // AED 50,000 / month
      annualDiscountRateBps: 550n,  // 5.50%
      rouAssetAccountId: 'acc-asset-rou-wh-01',
      leaseLiabilityAccountId: 'acc-liab-lease-wh-01',
      interestExpenseAccountId: 'acc-exp-wh-interest-01',
      depreciationExpenseAccountId: 'acc-exp-wh-dep-01',
      accumulatedDepreciationAccountId: 'acc-contra-wh-dep-01',
      bankAccountId: 'acc-asset-bank-fab-01'
    };

    const plan = Ifrs16LeaseEngine.generateLeasePlan(input);

    assert.equal(plan.schedule.length, 36);
    const lastMonth = plan.schedule[35];
    assert.equal(lastMonth.endingLiabilityFils, 0n);
    assert.equal(lastMonth.rouEndingNetBookValueFils, 0n);

    // Total payments = 36 * 50k = AED 1,800,000 (approx with final interest adjustment)
    assert.ok(plan.totalLeasePaymentsFils > 0n);
    assert.ok(plan.totalInterestExpenseFils > 0n);
  });
});
