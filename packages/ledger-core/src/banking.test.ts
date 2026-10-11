import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BankStatementParser, BankStatementLine } from './bank-statement-parser.js';
import {
  ReconciliationEngine,
  InternalLedgerTransaction,
  MatchConfidence
} from './reconciliation.js';
import { Direction } from './invariants.js';

describe('Banking & Reconciliation: UAE Bank CSV Statement Parser', () => {
  const sampleCsv = `Date,Description,Reference,Inflow,Outflow
2026-02-01,Customer Wire Transfer - Al Futtaim,REF-10029,50000.00,0.00
2026-02-02,Office Rent Ejari Payment,CHQ-88219,0.00,15000.50`;

  test('Parses UAE corporate bank statement into typed statement lines', () => {
    const lines = BankStatementParser.parseUaeBankCsv(sampleCsv, 'bank-acct-fab-01', 'AED');
    assert.equal(lines.length, 2);

    // Inflow line (Credit to bank statement)
    assert.equal(lines[0].direction, 'CREDIT');
    assert.equal(lines[0].amountFils, 5000000n); // 50,000.00 AED
    assert.equal(lines[0].reference, 'REF-10029');

    // Outflow line (Debit to bank statement)
    assert.equal(lines[1].direction, 'DEBIT');
    assert.equal(lines[1].amountFils, 1500050n); // 15,000.50 AED
    assert.equal(lines[1].reference, 'CHQ-88219');
  });
});

describe('Banking & Reconciliation: Matching Engine & Realized FX', () => {
  test('Exact match on amount and reference returns EXACT confidence', () => {
    const stmtLine: BankStatementLine = {
      id: 'stmt-1',
      bankAccountId: 'bank-fab-01',
      transactionDate: '2026-02-01',
      bookingDate: '2026-02-01',
      amountFils: 5000000n, // AED 50,000.00 Inflow
      currency: 'AED',
      direction: 'CREDIT',
      reference: 'INV-2026-0099',
      narrative: 'Customer Payment'
    };

    const ledgerTxns: InternalLedgerTransaction[] = [
      {
        id: 'txn-1',
        journalEntryId: 'jv-01',
        postingDate: '2026-02-01',
        amountFils: 5000000n,
        currency: 'AED',
        direction: Direction.DEBIT, // Debit Cash at Bank
        reference: 'INV-2026-0099',
        isReconciled: false
      }
    ];

    const match = ReconciliationEngine.reconcileOneToOne(stmtLine, ledgerTxns, 'AED');
    assert.equal(match.confidence, MatchConfidence.EXACT);
    assert.equal(match.matchedLedgerTransactionIds[0], 'txn-1');
    assert.equal(match.varianceFils, 0n);
  });

  test('Cross-currency match accurately computes Realized FX Gain/Loss', () => {
    // Scenario:
    // Invoice issued in USD: $10,000.00 (1,000,000 minor units).
    // Historical booking rate at invoice date: 3.67000000 AED/USD (367000000n) -> Booked AED = 36,700.00 (3,670,000 fils).
    // Payment received in AED bank account: Settled at current bank rate 3.67300000 AED/USD (367300000n).
    // Settled bank statement inflow = $10,000 * 3.673 = AED 36,730.00 (3,673,000 fils).
    // Realized FX Gain = 36,730.00 - 36,700.00 = +AED 30.00 (+3,000 fils).

    const stmtLine: BankStatementLine = {
      id: 'stmt-cross-1',
      bankAccountId: 'bank-fab-01',
      transactionDate: '2026-02-15',
      bookingDate: '2026-02-15',
      amountFils: 3673000n, // AED 36,730.00
      currency: 'AED',
      direction: 'CREDIT',
      reference: 'USD-INV-101',
      narrative: 'USD Customer Wire'
    };

    const ledgerTxns: InternalLedgerTransaction[] = [
      {
        id: 'txn-usd-1',
        journalEntryId: 'jv-ar-usd',
        postingDate: '2026-01-15',
        amountFils: 1000000n, // $10,000.00 USD
        currency: 'USD',
        direction: Direction.DEBIT,
        reference: 'USD-INV-101',
        isReconciled: false,
        historicalFxRate: 367000000n // 3.6700
      }
    ];

    const currentBankSettlementRate = 367300000n; // 3.6730

    const match = ReconciliationEngine.reconcileOneToOne(
      stmtLine,
      ledgerTxns,
      'AED',
      currentBankSettlementRate
    );

    assert.equal(match.confidence, MatchConfidence.HIGH);
    assert.equal(match.matchedLedgerTransactionIds[0], 'txn-usd-1');
    assert.equal(match.realizedFxGainLossFils, 3000n); // Exact 30.00 AED gain
    assert.match(match.explanation, /Realized FX Gain\/Loss = 3000 fils/);
  });
});
