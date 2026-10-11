import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BankStatementParser,
  BankStatementLine
} from './bank-statement-parser.js';
import {
  ReconciliationEngine,
  InternalLedgerTransaction,
  ReconciliationRule,
  MatchConfidence
} from './reconciliation.js';
import { LeanSandboxAggregatorAdapter } from './bank-feed-aggregator.js';
import { Direction } from './invariants.js';

describe('Milestone 5: Banking & Reconciliation Engine - Multi-Format Feeds & Labelled Evaluation', () => {
  describe('Multi-Format Bank Statement Ingestion', () => {
    test('Parses SWIFT MT940 statement (:61: statement line & :86: narrative)', () => {
      const mt940Content = `:20:STMT20260301
:25:AE0703300001029384756
:28C:001/01
:60F:C260301AED500000,00
:61:2603010301CR75000,00NTRFNONREF//INV-2026-0042
:86:Transfer from Emaar Development PJSC
:61:2603020302DR26,25NCHKNONREF//CHG-FAB-9921
:86:Outward SWIFT Transfer Bank Charges + VAT
:62F:C260302AED574973,75`;

      const lines = BankStatementParser.parseMt940(mt940Content, 'bank-fab-01', 'AED');
      assert.equal(lines.length, 2);

      // Inflow
      assert.equal(lines[0].direction, 'CREDIT');
      assert.equal(lines[0].amountFils, 7500000n); // AED 75,000.00
      assert.equal(lines[0].reference, 'INV-2026-0042');
      assert.equal(lines[0].narrative, 'Transfer from Emaar Development PJSC');

      // Outflow
      assert.equal(lines[1].direction, 'DEBIT');
      assert.equal(lines[1].amountFils, 2625n); // AED 26.25
      assert.equal(lines[1].reference, 'CHG-FAB-9921');
      assert.equal(lines[1].narrative, 'Outward SWIFT Transfer Bank Charges + VAT');
    });

    test('Parses ISO 20022 CAMT.053 XML statement', () => {
      const camt053Xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Acct><Id><IBAN>AE4402600009988776655</IBAN></Id></Acct>
      <Ntry>
        <Amt Ccy="AED">120000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-03-05</Dt></BookgDt>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>INV-DXB-9988</EndToEndId></Refs>
            <RltdPties><Dbtr><Nm>Majid Al Futtaim Group</Nm></Dbtr></RltdPties>
            <RmtInf><Ustrd>Quarterly ERP software license</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

      const lines = BankStatementParser.parseCamt053(camt053Xml, 'bank-enbd-01', 'AED');
      assert.equal(lines.length, 1);
      assert.equal(lines[0].direction, 'CREDIT');
      assert.equal(lines[0].amountFils, 12000000n); // AED 120,000.00
      assert.equal(lines[0].reference, 'INV-DXB-9988');
      assert.equal(lines[0].counterpartyName, 'Majid Al Futtaim Group');
    });

    test('Open Finance Aggregator Sandbox (Lean Technologies Adapter)', async () => {
      const adapter = new LeanSandboxAggregatorAdapter();
      const accounts = await adapter.fetchAccounts('tenant-uae-grp-01');
      assert.equal(accounts.length, 2);
      assert.equal(accounts[0].bankName, 'First Abu Dhabi Bank (FAB)');

      const syncResult = await adapter.syncFeed('lean-fab-corp-01');
      assert.equal(syncResult.status, 'SUCCESS');
      assert.equal(syncResult.transactionsSynced, 2);

      const isValidWebhook = adapter.verifyWebhookSignature('payload', 'valid_sig', 'secret_123');
      assert.equal(isValidWebhook, true);
    });
  });

  describe('Reconciliation Rules Engine & 1:Many Matching', () => {
    test('Automated rule triggers on bank charges and proposes balanced posting with 5% VAT', () => {
      const stmtLine: BankStatementLine = {
        id: 'stmt-chg-1',
        bankAccountId: 'bank-fab-01',
        transactionDate: '2026-03-02',
        bookingDate: '2026-03-02',
        amountFils: 2625n, // AED 26.25 (AED 25.00 net + AED 1.25 VAT)
        currency: 'AED',
        direction: 'DEBIT',
        reference: 'CHG-9901',
        narrative: 'SWIFT wire transfer fee'
      };

      const rules: ReconciliationRule[] = [
        {
          ruleId: 'RULE-BANK-CHG-01',
          ruleName: 'FAB Bank Charges Auto-Post',
          narrativePattern: 'wire transfer fee|bank charges|service charge',
          direction: 'DEBIT',
          targetAccountId: '6050-BANK-CHARGES',
          accountName: 'Bank Charges & Commissions Expense',
          vatApplicable: true,
          action: 'AUTO_POST_JOURNAL'
        }
      ];

      const match = ReconciliationEngine.applyRules(stmtLine, rules, '1010-FAB');
      assert.ok(match);
      assert.equal(match.matchType, 'RULE_AUTO_POST');
      assert.ok(match.proposedPosting);
      assert.equal(match.proposedPosting.debitAccountId, '6050-BANK-CHARGES');
      assert.equal(match.proposedPosting.creditAccountId, '1010-FAB');
      assert.equal(match.proposedPosting.amountFils, 2625n);
      assert.equal(match.proposedPosting.vatAmountFils, 125n); // AED 1.25 VAT extracted
    });

    test('1:Many Match correctly matches 1 lump sum receipt against 2 distinct customer invoices', () => {
      // Customer paid AED 50,000 in one wire to settle INV-1 (AED 30,000) and INV-2 (AED 20,000)
      const lumpSumStmtLine: BankStatementLine = {
        id: 'stmt-lump-1',
        bankAccountId: 'bank-fab-01',
        transactionDate: '2026-03-10',
        bookingDate: '2026-03-10',
        amountFils: 5000000n, // AED 50,000.00
        currency: 'AED',
        direction: 'CREDIT',
        reference: 'WIRE-EMAAR-BATCH',
        narrative: 'Lump sum invoice settlement'
      };

      const candidateTxns: InternalLedgerTransaction[] = [
        {
          id: 'txn-inv-1',
          journalEntryId: 'jv-ar-01',
          postingDate: '2026-03-01',
          amountFils: 3000000n, // AED 30,000.00
          currency: 'AED',
          direction: Direction.DEBIT,
          reference: 'INV-101',
          isReconciled: false
        },
        {
          id: 'txn-inv-2',
          journalEntryId: 'jv-ar-02',
          postingDate: '2026-03-02',
          amountFils: 2000000n, // AED 20,000.00
          currency: 'AED',
          direction: Direction.DEBIT,
          reference: 'INV-102',
          isReconciled: false
        },
        {
          id: 'txn-inv-other',
          journalEntryId: 'jv-ar-03',
          postingDate: '2026-03-03',
          amountFils: 1500000n, // AED 15,000.00 unrelated
          currency: 'AED',
          direction: Direction.DEBIT,
          reference: 'INV-103',
          isReconciled: false
        }
      ];

      const match = ReconciliationEngine.reconcileOneToMany(lumpSumStmtLine, candidateTxns);
      assert.ok(match);
      assert.equal(match.matchType, 'ONE_TO_MANY');
      assert.equal(match.confidence, MatchConfidence.VERY_HIGH);
      assert.equal(match.matchedLedgerTransactionIds.length, 2);
      assert.ok(match.matchedLedgerTransactionIds.includes('txn-inv-1'));
      assert.ok(match.matchedLedgerTransactionIds.includes('txn-inv-2'));
    });
  });

  describe('Labelled Dataset Accuracy Evaluation & Benchmarking', () => {
    interface LabelledSample {
      statementLine: BankStatementLine;
      expectedMatchedTxnIds: string[];
      expectedConfidenceMin: MatchConfidence;
      isPositiveMatch: boolean;
    }

    test('Reports precision, recall, and F1 score against labelled 25-transaction UAE dataset', () => {
      // 1. Create realistic internal GL candidates
      const ledgerPool: InternalLedgerTransaction[] = [];

      // 10 1:1 invoice transactions
      for (let i = 1; i <= 10; i++) {
        ledgerPool.push({
          id: `gl-inv-${i}`,
          journalEntryId: `jv-${i}`,
          postingDate: `2026-03-0${i}`,
          amountFils: BigInt(i * 1000000), // AED 10,000 to AED 100,000
          currency: 'AED',
          direction: Direction.DEBIT,
          reference: `INV-2026-00${i}`,
          isReconciled: false
        });
      }

      // 4 date-drift invoice transactions
      for (let i = 11; i <= 14; i++) {
        ledgerPool.push({
          id: `gl-drift-${i}`,
          journalEntryId: `jv-${i}`,
          postingDate: `2026-03-10`,
          amountFils: BigInt(i * 1000000),
          currency: 'AED',
          direction: Direction.DEBIT,
          reference: `REF-ORIG-${i}`,
          isReconciled: false
        });
      }

      // 2 1:Many components (AED 25,000 + AED 15,000 = AED 40,000)
      ledgerPool.push(
        {
          id: 'gl-lump-a',
          journalEntryId: 'jv-lump-a',
          postingDate: '2026-03-15',
          amountFils: 2500000n,
          currency: 'AED',
          direction: Direction.DEBIT,
          reference: 'INV-BATCH-A',
          isReconciled: false
        },
        {
          id: 'gl-lump-b',
          journalEntryId: 'jv-lump-b',
          postingDate: '2026-03-15',
          amountFils: 1500000n,
          currency: 'AED',
          direction: Direction.DEBIT,
          reference: 'INV-BATCH-B',
          isReconciled: false
        }
      );

      // 1 Cross-currency USD transaction ($10,000 booked at 3.6700, settled at 3.6725)
      ledgerPool.push({
        id: 'gl-usd-client',
        journalEntryId: 'jv-usd',
        postingDate: '2026-02-15',
        amountFils: 1000000n, // $10,000.00 USD
        currency: 'USD',
        direction: Direction.DEBIT,
        reference: 'USD-INV-99',
        isReconciled: false,
        historicalFxRate: 367000000n
      });

      // Rules pool
      const rules: ReconciliationRule[] = [
        {
          ruleId: 'RULE-FEE',
          ruleName: 'Bank Charges',
          narrativePattern: 'SWIFT wire fee|Service fee',
          direction: 'DEBIT',
          targetAccountId: '6050',
          accountName: 'Bank Charges',
          action: 'AUTO_POST_JOURNAL'
        }
      ];

      // 2. Build 25 labelled ground-truth test statement lines
      const dataset: LabelledSample[] = [];

      // 10 Exact 1:1 Matches
      for (let i = 1; i <= 10; i++) {
        dataset.push({
          statementLine: {
            id: `stmt-eval-${i}`,
            bankAccountId: 'bank-fab-01',
            transactionDate: `2026-03-0${i}`,
            bookingDate: `2026-03-0${i}`,
            amountFils: BigInt(i * 1000000),
            currency: 'AED',
            direction: 'CREDIT',
            reference: `INV-2026-00${i}`,
            narrative: `Customer Payment for INV-2026-00${i}`
          },
          expectedMatchedTxnIds: [`gl-inv-${i}`],
          expectedConfidenceMin: MatchConfidence.EXACT,
          isPositiveMatch: true
        });
      }

      // 4 High-confidence date-drift matches (reference differs slightly)
      for (let i = 11; i <= 14; i++) {
        dataset.push({
          statementLine: {
            id: `stmt-drift-${i}`,
            bankAccountId: 'bank-fab-01',
            transactionDate: `2026-03-12`, // 2 days drift
            bookingDate: `2026-03-12`,
            amountFils: BigInt(i * 1000000),
            currency: 'AED',
            direction: 'CREDIT',
            reference: `BANK-TXN-DRIFT-${i}`, // different ref
            narrative: `Bank Inflow ${i}`
          },
          expectedMatchedTxnIds: [`gl-drift-${i}`],
          expectedConfidenceMin: MatchConfidence.HIGH,
          isPositiveMatch: true
        });
      }

      // 1 Lump sum 1:Many match (AED 40,000 = AED 25,000 + AED 15,000)
      dataset.push({
        statementLine: {
          id: 'stmt-lump-40k',
          bankAccountId: 'bank-fab-01',
          transactionDate: '2026-03-16',
          bookingDate: '2026-03-16',
          amountFils: 4000000n, // AED 40,000
          currency: 'AED',
          direction: 'CREDIT',
          reference: 'LUMP-SETTLEMENT',
          narrative: 'Customer Batch Inflow'
        },
        expectedMatchedTxnIds: ['gl-lump-a', 'gl-lump-b'],
        expectedConfidenceMin: MatchConfidence.VERY_HIGH,
        isPositiveMatch: true
      });

      // 3 Rule-based Bank Fees
      for (let i = 1; i <= 3; i++) {
        dataset.push({
          statementLine: {
            id: `stmt-fee-${i}`,
            bankAccountId: 'bank-fab-01',
            transactionDate: `2026-03-2${i}`,
            bookingDate: `2026-03-2${i}`,
            amountFils: 2500n,
            currency: 'AED',
            direction: 'DEBIT',
            reference: `CHG-${i}`,
            narrative: 'SWIFT wire fee monthly debit'
          },
          expectedMatchedTxnIds: [],
          expectedConfidenceMin: MatchConfidence.EXACT,
          isPositiveMatch: true
        });
      }

      // 1 Cross-currency USD wire settled in AED (USD 10,000 @ 3.6725 = AED 36,725)
      dataset.push({
        statementLine: {
          id: 'stmt-usd-settled',
          bankAccountId: 'bank-fab-01',
          transactionDate: '2026-03-25',
          bookingDate: '2026-03-25',
          amountFils: 3672500n,
          currency: 'AED',
          direction: 'CREDIT',
          reference: 'USD-INV-99',
          narrative: 'USD Customer Inward Wire'
        },
        expectedMatchedTxnIds: ['gl-usd-client'],
        expectedConfidenceMin: MatchConfidence.HIGH,
        isPositiveMatch: true
      });

      // 6 Legitimate Unmatched Lines (e.g. unknown external wires, deposit errors)
      for (let i = 1; i <= 6; i++) {
        dataset.push({
          statementLine: {
            id: `stmt-unmatched-${i}`,
            bankAccountId: 'bank-fab-01',
            transactionDate: `2026-03-2${i}`,
            bookingDate: `2026-03-2${i}`,
            amountFils: BigInt(990000 + i * 11111),
            currency: 'AED',
            direction: 'CREDIT',
            reference: `UNKNOWN-${i}`,
            narrative: `Unidentified wire transfer #${i}`
          },
          expectedMatchedTxnIds: [],
          expectedConfidenceMin: MatchConfidence.UNMATCHED,
          isPositiveMatch: false
        });
      }

      // Execute batch reconciliation
      const statementLines = dataset.map((d) => d.statementLine);
      const batchReport = ReconciliationEngine.runBatchReconciliation(
        statementLines,
        ledgerPool,
        rules,
        'AED',
        367250000n // Current USD settlement rate: 3.6725
      );

      // Evaluate against ground truth
      let truePositives = 0;
      let falsePositives = 0;
      let falseNegatives = 0;
      let trueNegatives = 0;

      for (const sample of dataset) {
        const result = batchReport.results.find(
          (r) => r.statementLineId === sample.statementLine.id
        );
        assert.ok(result, `Result must exist for ${sample.statementLine.id}`);

        const engineFoundMatch = result.confidence > MatchConfidence.UNMATCHED;

        if (sample.isPositiveMatch) {
          if (engineFoundMatch) {
            truePositives++;
          } else {
            falseNegatives++;
          }
        } else {
          // Negative sample (should be UNMATCHED)
          if (!engineFoundMatch) {
            trueNegatives++;
          } else {
            falsePositives++;
          }
        }
      }

      // Calculate precision, recall, F1
      const precision = truePositives / (truePositives + falsePositives);
      const recall = truePositives / (truePositives + falseNegatives);
      const f1Score = (2 * (precision * recall)) / (precision + recall);

      // Asserts according to PRD / NFR thresholds
      assert.ok(
        precision >= 0.98,
        `Precision ${precision} must be >= 0.98 (zero false positives on auto-match)`
      );
      assert.ok(recall >= 0.95, `Recall ${recall} must be >= 0.95`);
      assert.ok(f1Score >= 0.96, `F1 Score ${f1Score} must be >= 0.96`);
      assert.equal(falsePositives, 0, 'Zero false positive matches permitted');

      // Verify batch metrics
      assert.equal(batchReport.totalStatementLines, 25);
      assert.equal(batchReport.matchedLinesCount, 19);
      assert.equal(batchReport.unmatchedLinesCount, 6);
      assert.equal(batchReport.autoPostedRulesCount, 3);
    });
  });
});
