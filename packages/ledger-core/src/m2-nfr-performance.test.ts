import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FxRevaluationEngine, MonetaryAccountBalance } from './fx-revaluation.js';
import { TrialBalanceAggregator } from './trial-balance-aggregator.js';
import { Direction } from './invariants.js';

describe('Milestone 2: FX Revaluation & Trial Balance NFR Performance', () => {
  test('IAS 21 Period-end FX Revaluation accurately computes unrealized gain/loss', () => {
    // Scenario:
    // USD Bank Account holding $100,000.00 (10,000,000 minor units)
    // Booked original AED rate: 3.6700 -> AED 367,000.00 (36,700,000 fils)
    // Closing period exchange rate: 3.6730 (367300000n scale 10^8)
    // Revalued AED = $100,000 * 3.6730 = AED 367,300.00 (36,730,000 fils)
    // Unrealized FX Gain = +AED 300.00 (+30,000 fils)

    const account: MonetaryAccountBalance = {
      accountId: 'acc-usd-bank-01',
      currency: 'USD',
      foreignBalanceTxn: 10000000n,
      bookedBaseBalanceFils: 36700000n
    };

    const closingRate = 367300000n; // 3.6730
    const reval = FxRevaluationEngine.revalueMonetaryAccount(
      'period-2026-q1',
      account,
      closingRate,
      'acc-unrealized-fx-gain-loss'
    );

    assert.equal(reval.revaluedBaseFils, 36730000n);
    assert.equal(reval.unrealizedGainLossFils, 30000n);
    assert.equal(reval.isGain, true);
    assert.equal(reval.adjustingJournalLine.direction, Direction.CREDIT); // Credit Unrealized Gain
    assert.equal(reval.adjustingJournalLine.amountBase, 30000n);
  });

  test('Trial Balance Aggregation on 1,000,000 synthetic lines meets NFR target (< 3,000 ms)', () => {
    const totalLinesToGenerate = 1000000;
    const lines = [];

    const accounts = [
      { id: 'acc-cash', code: '10100', name: 'Cash at Bank' },
      { id: 'acc-ar', code: '11000', name: 'Accounts Receivable' },
      { id: 'acc-ap', code: '20100', name: 'Accounts Payable' },
      { id: 'acc-rev', code: '40100', name: 'Commercial Sales' },
      { id: 'acc-exp', code: '50100', name: 'Operating Expenses' }
    ];

    // Generate balanced synthetic lines
    for (let i = 0; i < totalLinesToGenerate / 2; i++) {
      const accDebit = accounts[i % 2]; // Cash or AR
      const accCredit = accounts[2 + (i % 3)]; // AP, Rev, or Exp

      lines.push({
        accountId: accDebit.id,
        accountCode: accDebit.code,
        accountName: accDebit.name,
        amountBaseFils: 10000n, // AED 100.00
        direction: 'DEBIT' as const
      });

      lines.push({
        accountId: accCredit.id,
        accountCode: accCredit.code,
        accountName: accCredit.name,
        amountBaseFils: 10000n,
        direction: 'CREDIT' as const
      });
    }

    // Execute aggregation
    const result = TrialBalanceAggregator.aggregateLines('2026-12-31', lines);

    // Verify Invariants & Balance
    assert.equal(result.isBalanced, true);
    assert.equal(result.totalDebitsBaseFils, result.totalCreditsBaseFils);
    assert.equal(result.rows.length, 5);

    // Verify NFR performance target: < 3,000 ms (typically < 300ms in Node.js)
    assert.ok(
      result.executionTimeMs < 3000,
      `Trial balance took ${result.executionTimeMs} ms, exceeding target of 3,000 ms`
    );
  });
});
