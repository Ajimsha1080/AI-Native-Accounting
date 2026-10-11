import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { roundHalfEven, convertCurrency } from './money.js';
import { validateLedgerInvariants, Direction, JournalEntryCandidate } from './invariants.js';
import { PeriodManager, PeriodLockStatus, PeriodLockedException } from './period.js';
import { buildBalancedMultiCurrencyLines } from './fx.js';

describe('Ledger Core: Period Lock Engine', () => {
  const periodManager = new PeriodManager();
  const testPeriodId = 'period-2026-01';

  periodManager.registerPeriod({
    periodId: testPeriodId,
    entityId: 'entity-dubai-01',
    fiscalYear: 2026,
    periodNumber: 1,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    status: PeriodLockStatus.OPEN
  });

  test('Open period allows postings without exception', () => {
    assert.doesNotThrow(() => {
      periodManager.assertPostingPermitted(testPeriodId);
    });
  });

  test('Hard locked period throws PeriodLockedException', () => {
    periodManager.lockPeriod(testPeriodId, 'usr-controller-01', true);
    assert.throws(
      () => {
        periodManager.assertPostingPermitted(testPeriodId);
      },
      (err: any) => {
        return err instanceof PeriodLockedException && err.status === PeriodLockStatus.HARD_LOCKED;
      }
    );
  });

  test('Reopening period requires mandatory justification', () => {
    assert.throws(() => {
      periodManager.reopenPeriod(testPeriodId, 'usr-cfo-01', 'too short');
    });

    const reopened = periodManager.reopenPeriod(
      testPeriodId,
      'usr-cfo-01',
      'Auditor adjustment requested by PwC for late vendor invoice'
    );
    assert.equal(reopened.status, PeriodLockStatus.OPEN);
    assert.doesNotThrow(() => {
      periodManager.assertPostingPermitted(testPeriodId);
    });
  });
});

describe('Ledger Core: Multi-Currency & FX Rounding Reconciliation', () => {
  const fxRoundingAccount = 'acct-fx-rounding-gain-loss';

  test('Generates automatic balancing line when multi-currency rounding drift occurs', () => {
    // 3 split foreign currency expenses totaling 100 USD at rate 3.6725
    // 1) 33.33 USD = 3333 minor units -> 3333 * 367250000 / 10^8 = 12240.4425 -> 12240 fils (122.40 AED)
    // 2) 33.33 USD = 3333 minor units -> 12240 fils (122.40 AED)
    // 3) 33.34 USD = 3334 minor units -> 3334 * 367250000 / 10^8 = 12244.1150 -> 12244 fils (122.44 AED)
    // Total Debits Base = 12240 + 12240 + 12244 = 36724 fils (367.24 AED)
    // Total Credit Line: 100.00 USD = 10000 minor units -> 10000 * 367250000 / 10^8 = 36725 fils (367.25 AED)
    // Variance = 1 fil difference due to rounding of split items!

    const inputs = [
      {
        accountId: 'acct-exp-1',
        currency: 'USD',
        amountTxn: 3333n,
        fxRate: 367250000n,
        direction: Direction.DEBIT
      },
      {
        accountId: 'acct-exp-2',
        currency: 'USD',
        amountTxn: 3333n,
        fxRate: 367250000n,
        direction: Direction.DEBIT
      },
      {
        accountId: 'acct-exp-3',
        currency: 'USD',
        amountTxn: 3334n,
        fxRate: 367250000n,
        direction: Direction.DEBIT
      },
      {
        accountId: 'acct-ap-usd',
        currency: 'USD',
        amountTxn: 10000n,
        fxRate: 367250000n,
        direction: Direction.CREDIT
      }
    ];

    const result = buildBalancedMultiCurrencyLines(inputs, fxRoundingAccount);

    // Debits and Credits must now balance exactly
    assert.equal(result.totalDebitsBase, result.totalCreditsBase);
    assert.ok(result.fxRoundingLine, 'FX rounding line should be created');
    assert.equal(result.fxRoundingLine.amountBase, 1n); // Exactly 1 fil
    assert.equal(result.fxRoundingLine.direction, Direction.DEBIT);
  });
});

describe('Ledger Core: Property-Based Mathematical Invariant Permutations', () => {
  test('Property test: 10,000 randomized balanced entries strictly uphold Debits == Credits', () => {
    // Generate 10,000 permutations of random multi-line entries
    for (let i = 0; i < 10000; i++) {
      const lineCount = 2 + (i % 8); // 2 to 9 lines
      const amounts: bigint[] = [];
      let runningTotal = 0n;

      for (let j = 0; j < lineCount - 1; j++) {
        const randAmount = BigInt(Math.floor(Math.random() * 100000) + 1);
        amounts.push(randAmount);
        runningTotal += randAmount;
      }
      amounts.push(runningTotal); // balancing line

      const lines = amounts.map((amt, idx) => ({
        accountId: `acct-${idx}`,
        currency: 'AED',
        amountTxn: amt,
        amountBase: amt,
        fxRate: 100000000n,
        direction: idx === lineCount - 1 ? Direction.CREDIT : Direction.DEBIT
      }));

      const entry: JournalEntryCandidate = {
        tenantId: 'ten-prop-1',
        entityId: 'ent-prop-1',
        bookId: 'book-prop-1',
        periodId: 'period-prop-1',
        entryNumber: `VOUCHER-PROP-${i}`,
        postingDate: '2026-01-01',
        documentDate: '2026-01-01',
        sourceModule: 'PROPERTY_TEST',
        memoEn: `Property test voucher ${i}`,
        createdBy: 'usr-test',
        lines
      };

      const validation = validateLedgerInvariants(entry);
      assert.equal(validation.isValid, true, `Permutation ${i} failed invariant validation`);
      assert.equal(validation.differenceBase, 0n);
    }
  });

  test('Property test: Banker Rounding symmetry on 10,000 random quotients', () => {
    for (let i = 0; i < 10000; i++) {
      const intPart = BigInt(Math.floor(Math.random() * 100000));
      // Exact half: e.g. intPart + 0.5 = (intPart * 10 + 5) / 10
      const numerator = intPart * 10n + 5n;
      const rounded = roundHalfEven(numerator, 10n);

      if (intPart % 2n === 0n) {
        // Even integer + 0.5 must round down to even integer
        assert.equal(rounded, intPart, `Even half failed at ${intPart}`);
      } else {
        // Odd integer + 0.5 must round up to even integer
        assert.equal(rounded, intPart + 1n, `Odd half failed at ${intPart}`);
      }
    }
  });
});
