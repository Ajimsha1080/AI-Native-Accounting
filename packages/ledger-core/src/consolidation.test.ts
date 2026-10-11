import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ConsolidationEngine, IntercompanyBalance } from './consolidation.js';
import { Direction } from './invariants.js';

describe('Multi-Entity Consolidation (IFRS 10)', () => {
  test('Eliminates reciprocal intercompany loan receivables and payables with balanced journal', () => {
    const intercompany: IntercompanyBalance = {
      parentEntityId: 'ent-parent-holdings',
      subsidiaryEntityId: 'ent-sub-trading',
      receivableAccountId: 'acc-parent-ic-ar',
      payableAccountId: 'acc-sub-ic-ap',
      intercompanyAmountFils: 50000000n, // AED 500,000.00
      currency: 'AED'
    };

    const result = ConsolidationEngine.eliminateIntercompanyBalances(
      'period-2026-q1',
      intercompany,
      'book-eliminations'
    );

    assert.equal(result.eliminatedAmountFils, 50000000n);
    assert.equal(result.netConsolidatedReceivablesFils, 0n);
    assert.equal(result.netConsolidatedPayablesFils, 0n);

    // Verify balanced elimination voucher
    const lines = result.eliminationJournal.lines;
    assert.equal(lines.length, 2);
    assert.equal(lines[0].direction, Direction.DEBIT);
    assert.equal(lines[0].amountBase, 50000000n);
    assert.equal(lines[1].direction, Direction.CREDIT);
    assert.equal(lines[1].amountBase, 50000000n);
  });
});
