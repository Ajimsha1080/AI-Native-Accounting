import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { roundHalfEven, convertCurrency, formatMoney } from './money.js';
import { validateLedgerInvariants, Direction, JournalEntryCandidate } from './invariants.js';
import { computeVoucherHash } from './hash.js';

describe('Ledger Core: Money and Arithmetic Precision', () => {
  test('Bankers Rounding (roundHalfEven) rounds to nearest even integer on exact half', () => {
    // 2.5 -> 2
    assert.equal(roundHalfEven(25n, 10n), 2n);
    // 3.5 -> 4
    assert.equal(roundHalfEven(35n, 10n), 4n);
    // 4.5 -> 4
    assert.equal(roundHalfEven(45n, 10n), 4n);
    // 2.4 -> 2
    assert.equal(roundHalfEven(24n, 10n), 2n);
    // 2.6 -> 3
    assert.equal(roundHalfEven(26n, 10n), 3n);
  });

  test('FX Currency conversion (convertCurrency) handles 8-digit precision', () => {
    // 100.00 USD (10000 minor units) @ 3.67250000 AED/USD (367250000n scale 10^8)
    const usdAmount = 10000n;
    const fxRate = 367250000n; // 3.6725
    const aedAmount = convertCurrency(usdAmount, fxRate);
    assert.equal(aedAmount, 36725n); // 367.25 AED
    assert.equal(formatMoney(aedAmount, 'AED'), '367.25');
  });
});

describe('Ledger Core: Invariant Verifications', () => {
  const dummyEntry: JournalEntryCandidate = {
    tenantId: '11111111-1111-1111-1111-111111111111',
    entityId: '22222222-2222-2222-2222-222222222222',
    bookId: '33333333-3333-3333-3333-333333333333',
    periodId: '44444444-4444-4444-4444-444444444444',
    entryNumber: 'VOUCHER-2026-0001',
    postingDate: '2026-01-15',
    documentDate: '2026-01-15',
    sourceModule: 'MANUAL',
    memoEn: 'Office Rent Payment',
    createdBy: '55555555-5555-5555-5555-555555555555',
    lines: [
      {
        accountId: '66666666-6666-6666-6666-666666666666',
        currency: 'AED',
        amountTxn: 1000000n, // 10,000.00 AED
        amountBase: 1000000n,
        fxRate: 100000000n,
        direction: Direction.DEBIT
      },
      {
        accountId: '77777777-7777-7777-7777-777777777777',
        currency: 'AED',
        amountTxn: 1000000n, // 10,000.00 AED
        amountBase: 1000000n,
        fxRate: 100000000n,
        direction: Direction.CREDIT
      }
    ]
  };

  test('Valid balanced journal entry passes invariant checks', () => {
    const result = validateLedgerInvariants(dummyEntry);
    assert.equal(result.isValid, true);
    assert.equal(result.differenceBase, 0n);
    assert.equal(result.errors.length, 0);
  });

  test('Imbalanced journal entry fails with precise difference', () => {
    const imbalanced = {
      ...dummyEntry,
      lines: [
        { ...dummyEntry.lines[0], amountBase: 1000000n },
        { ...dummyEntry.lines[1], amountBase: 999900n } // 1 AED deficit
      ]
    };
    const result = validateLedgerInvariants(imbalanced);
    assert.equal(result.isValid, false);
    assert.equal(result.differenceBase, 100n);
    assert.match(result.errors[0], /Ledger Invariant Violation/);
  });

  test('Voucher Merkle SHA-256 hash is deterministic and tamper-evident', () => {
    const hash1 = computeVoucherHash(dummyEntry);
    const hash2 = computeVoucherHash(dummyEntry);
    assert.equal(hash1, hash2);

    const modifiedEntry = {
      ...dummyEntry,
      memoEn: 'Tampered memo'
    };
    // If lines or vouchers change, hash must differ
    const hashTampered = computeVoucherHash({
      ...dummyEntry,
      lines: [
        { ...dummyEntry.lines[0], amountTxn: 2000000n },
        { ...dummyEntry.lines[1], amountTxn: 2000000n }
      ]
    });
    assert.notEqual(hash1, hashTampered);
  });
});
