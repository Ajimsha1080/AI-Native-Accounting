import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  Ifrs15RevenueEngine,
  RevenueRecognitionMethod,
  PerformanceObligationInput
} from './ifrs15-revenue.js';

describe('IFRS 15 Revenue Recognition & Deferred Revenue Waterfalls', () => {
  test('Allocates bundle transaction price based on relative Standalone Selling Prices (SSP)', () => {
    // Scenario:
    // Bundled Contract Price: AED 100,000.00 (10,000,000 fils)
    // Obligation 1: Enterprise Hardware (Point in time) -> Standalone Price = AED 80,000 (8,000,000 fils)
    // Obligation 2: 12-Month Cloud Maintenance (Over time) -> Standalone Price = AED 40,000 (4,000,000 fils)
    // Total SSP = 80k + 40k = 120,000 AED (12,000,000 fils)
    // Discount Bundle = 100k / 120k = 83.333%
    // Allocated Obligation 1 = 100,000 * (80 / 120) = 66,666.67 AED (6,666,667 fils)
    // Allocated Obligation 2 = 100,000 * (40 / 120) = 33,333.33 AED (3,333,333 fils)
    // Total allocated must equal 10,000,000 fils exactly.

    const obligations: PerformanceObligationInput[] = [
      {
        obligationId: 'ob-hw',
        description: 'Enterprise Hardware Appliance',
        standaloneSellingPriceFils: 8000000n,
        recognitionMethod: RevenueRecognitionMethod.POINT_IN_TIME
      },
      {
        obligationId: 'ob-saas',
        description: '12-Month Cloud Maintenance',
        standaloneSellingPriceFils: 4000000n,
        recognitionMethod: RevenueRecognitionMethod.OVER_TIME_STRAIGHT_LINE,
        serviceDurationMonths: 12
      }
    ];

    const plan = Ifrs15RevenueEngine.allocateTransactionPrice(
      'contract-uae-corp-01',
      10000000n,
      obligations
    );

    assert.equal(plan.obligations[0].allocatedTransactionPriceFils, 6666667n);
    assert.equal(plan.obligations[1].allocatedTransactionPriceFils, 3333333n);

    // Sum of allocated obligations must equal the transaction price
    const sumAllocated =
      plan.obligations[0].allocatedTransactionPriceFils +
      plan.obligations[1].allocatedTransactionPriceFils;
    assert.equal(sumAllocated, 10000000n);

    // Check monthly straight-line revenue for Cloud maintenance (3,333,333 / 12 = 277,778 fils)
    assert.equal(plan.obligations[1].monthlyRevenueFils, 277778n);

    // Check deferred revenue waterfall progression
    assert.equal(plan.waterfallSchedule.length, 12);
    // Month 1 recognizes Hardware (point in time) + Month 1 Cloud Maintenance
    const month1 = plan.waterfallSchedule[0];
    assert.equal(month1.recognizedRevenueFils, 6666667n + 277778n);

    // Final month remaining deferred revenue must be fully exhausted (or down to 0)
    const month12 = plan.waterfallSchedule[11];
    assert.equal(month12.remainingDeferredRevenueFils, 0n);

    // Verify schedule reconciliation invariant
    const isReconciled = Ifrs15RevenueEngine.verifyScheduleReconciliation(plan);
    assert.equal(isReconciled, true);
  });

  test('Contract AI Clause Citations & Balanced Rev Rec Journal Voucher Generation', () => {
    const obligations: PerformanceObligationInput[] = [
      {
        obligationId: 'ob-license',
        description: 'Multi-Entity ERP Perpetual License',
        standaloneSellingPriceFils: 15000000n, // AED 150k
        recognitionMethod: RevenueRecognitionMethod.POINT_IN_TIME,
        citedClauseSection: 'Section 2.1 - License Grant',
        citedClauseText: 'Licensor grants non-exclusive perpetual license upon digital delivery.'
      },
      {
        obligationId: 'ob-support',
        description: 'Year 1 Mission-Critical 24/7 SLA Support',
        standaloneSellingPriceFils: 5000000n, // AED 50k
        recognitionMethod: RevenueRecognitionMethod.OVER_TIME_STRAIGHT_LINE,
        serviceDurationMonths: 12,
        citedClauseSection: 'Section 4.3 - Support SLA',
        citedClauseText: 'Vendor shall provide 99.9% uptime SLA support for a duration of 12 calendar months.'
      }
    ];

    const plan = Ifrs15RevenueEngine.allocateTransactionPrice(
      'contract-adgm-holding-02',
      18000000n, // AED 180,000 bundled transaction price
      obligations
    );

    // Verify Contract AI metadata is preserved
    assert.equal(plan.obligations[0].citedClauseSection, 'Section 2.1 - License Grant');
    assert.ok(plan.obligations[0].citedClauseText?.includes('perpetual license'));
    assert.equal(plan.obligations[1].citedClauseSection, 'Section 4.3 - Support SLA');

    // Verify schedule reconciliation invariant
    assert.equal(Ifrs15RevenueEngine.verifyScheduleReconciliation(plan), true);

    // Generate Month 1 rev rec journal entry
    const defRevAccountId = 'acc-liab-deferred-rev-01';
    const revAccountId = 'acc-inc-software-rev-01';
    const journalEntry = Ifrs15RevenueEngine.generateRevRecJournalEntry(
      plan,
      1,
      defRevAccountId,
      revAccountId
    );

    assert.equal(journalEntry.isBalanced, true);
    assert.equal(journalEntry.debits[0].amountFils, journalEntry.credits[0].amountFils);
    assert.equal(journalEntry.debits[0].accountId, defRevAccountId);
    assert.equal(journalEntry.credits[0].accountId, revAccountId);
  });
});
