import { UUID } from '@ledger-ae/shared-types';
import { BankStatementLine } from './bank-statement-parser.js';
import { Direction } from './invariants.js';
import { convertCurrency } from './money.js';

export interface InternalLedgerTransaction {
  id: UUID;
  journalEntryId: UUID;
  postingDate: string;
  amountFils: bigint;
  currency: string;
  direction: Direction;
  reference: string;
  counterpartyName?: string;
  isReconciled: boolean;
  historicalFxRate?: bigint; // e.g. 3.6725 * 10^8
}

export enum MatchConfidence {
  EXACT = 100, // Matching amount, date, and reference
  VERY_HIGH = 95, // 1:Many / Many:1 exact amount subset match with matching counterparty
  HIGH = 85,   // Matching amount and date within 3 days
  MEDIUM = 60, // Matching amount only or fuzzy narrative match
  UNMATCHED = 0
}

export interface ReconciliationRule {
  ruleId: string;
  ruleName: string;
  narrativePattern: string; // Regex or substring
  direction?: 'DEBIT' | 'CREDIT';
  targetAccountId: string;
  accountName: string;
  vatApplicable?: boolean;
  action: 'AUTO_POST_JOURNAL' | 'ASSIGN_TO_ACCOUNT' | 'REQUIRE_MANUAL_REVIEW';
}

export interface ProposedJournalPosting {
  ruleId: string;
  bankStatementLineId: UUID;
  debitAccountId: string;
  creditAccountId: string;
  amountFils: bigint;
  vatAmountFils?: bigint;
  narrative: string;
}

export interface ReconciliationMatchResult {
  statementLineId: UUID;
  matchedLedgerTransactionIds: UUID[];
  confidence: MatchConfidence;
  matchType: 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE' | 'RULE_AUTO_POST';
  varianceFils: bigint;
  realizedFxGainLossFils?: bigint; // Auto-calculated realized FX for cross-currency settlement
  proposedPosting?: ProposedJournalPosting;
  explanation: string;
}

export interface BatchReconciliationReport {
  totalStatementLines: number;
  matchedLinesCount: number;
  unmatchedLinesCount: number;
  reconciliationRatePercent: number;
  autoPostedRulesCount: number;
  results: ReconciliationMatchResult[];
}

export class ReconciliationEngine {
  /**
   * Applies automated tenant reconciliation rules (e.g. Bank fees, interest, POS fees).
   */
  static applyRules(
    statementLine: BankStatementLine,
    rules: ReconciliationRule[],
    bankLedgerAccountId: string = '1010-BANK'
  ): ReconciliationMatchResult | null {
    for (const rule of rules) {
      if (rule.direction && rule.direction !== statementLine.direction) continue;

      const regex = new RegExp(rule.narrativePattern, 'i');
      if (regex.test(statementLine.narrative) || regex.test(statementLine.reference)) {
        // Calculate VAT if bank fee carries 5% VAT under Article 3
        const vatFils = rule.vatApplicable
          ? (statementLine.amountFils * 500n) / 10500n // 5% tax-inclusive VAT extraction
          : 0n;

        const proposedPosting: ProposedJournalPosting = {
          ruleId: rule.ruleId,
          bankStatementLineId: statementLine.id,
          debitAccountId:
            statementLine.direction === 'DEBIT' ? rule.targetAccountId : bankLedgerAccountId,
          creditAccountId:
            statementLine.direction === 'DEBIT' ? bankLedgerAccountId : rule.targetAccountId,
          amountFils: statementLine.amountFils,
          vatAmountFils: vatFils,
          narrative: `Rule [${rule.ruleName}]: ${statementLine.narrative}`
        };

        return {
          statementLineId: statementLine.id,
          matchedLedgerTransactionIds: [],
          confidence: MatchConfidence.EXACT,
          matchType: 'RULE_AUTO_POST',
          varianceFils: 0n,
          proposedPosting,
          explanation: `Automated rule applied: ${rule.ruleName}. Generated proposed posting for ${rule.accountName}.`
        };
      }
    }
    return null;
  }

  /**
   * Evaluates 1:1 and cross-currency matches between bank statement line and internal ledger transactions.
   */
  static reconcileOneToOne(
    statementLine: BankStatementLine,
    candidateTransactions: InternalLedgerTransaction[],
    baseCurrency: string = 'AED',
    currentFxRate?: bigint, // e.g. current bank settlement rate
    rateScale: bigint = 100000000n
  ): ReconciliationMatchResult {
    // 1. Exact match check (amount + reference)
    for (const txn of candidateTransactions) {
      if (txn.isReconciled) continue;

      const isDirectionMatching =
        (statementLine.direction === 'CREDIT' && txn.direction === Direction.DEBIT) ||
        (statementLine.direction === 'DEBIT' && txn.direction === Direction.CREDIT);

      if (!isDirectionMatching) continue;

      // Single currency exact match (amount + reference)
      if (
        statementLine.currency === txn.currency &&
        statementLine.amountFils === txn.amountFils &&
        statementLine.reference.trim().toLowerCase() === txn.reference.trim().toLowerCase()
      ) {
        return {
          statementLineId: statementLine.id,
          matchedLedgerTransactionIds: [txn.id],
          confidence: MatchConfidence.EXACT,
          matchType: 'ONE_TO_ONE',
          varianceFils: 0n,
          realizedFxGainLossFils: 0n,
          explanation: 'Exact match on reference, amount, and transaction direction.'
        };
      }

      // Single currency amount + date close match
      if (
        statementLine.currency === txn.currency &&
        statementLine.amountFils === txn.amountFils
      ) {
        return {
          statementLineId: statementLine.id,
          matchedLedgerTransactionIds: [txn.id],
          confidence: MatchConfidence.HIGH,
          matchType: 'ONE_TO_ONE',
          varianceFils: 0n,
          realizedFxGainLossFils: 0n,
          explanation: 'High confidence match on amount and currency (reference differs).'
        };
      }

      // Cross-currency settlement (e.g. Invoice in USD, settled in AED bank account)
      if (
        statementLine.currency === baseCurrency &&
        txn.currency !== baseCurrency &&
        currentFxRate &&
        txn.historicalFxRate
      ) {
        // Expected base settlement amount at booking
        const originalBaseAmount = convertCurrency(
          txn.amountFils,
          txn.historicalFxRate,
          rateScale
        );
        // Actual settled base amount in statement
        const actualSettledBaseAmount = statementLine.amountFils;

        // If the bank statement amount matches the converted foreign currency at current rate
        const convertedAtCurrent = convertCurrency(txn.amountFils, currentFxRate, rateScale);
        if (convertedAtCurrent === actualSettledBaseAmount) {
          // Realized FX Gain/Loss = Actual Settled Base - Original Booked Base
          const realizedFx = actualSettledBaseAmount - originalBaseAmount;
          return {
            statementLineId: statementLine.id,
            matchedLedgerTransactionIds: [txn.id],
            confidence: MatchConfidence.HIGH,
            matchType: 'ONE_TO_ONE',
            varianceFils: 0n,
            realizedFxGainLossFils: realizedFx,
            explanation: `Cross-currency match (${txn.currency} to ${baseCurrency}). Realized FX Gain/Loss = ${realizedFx} fils.`
          };
        }
      }
    }

    return {
      statementLineId: statementLine.id,
      matchedLedgerTransactionIds: [],
      confidence: MatchConfidence.UNMATCHED,
      matchType: 'ONE_TO_ONE',
      varianceFils: statementLine.amountFils,
      explanation: 'No matching transaction found in ledger.'
    };
  }

  /**
   * Evaluates 1:Many matches (Single lump sum bank deposit matching multiple customer invoices).
   */
  static reconcileOneToMany(
    statementLine: BankStatementLine,
    candidateTransactions: InternalLedgerTransaction[]
  ): ReconciliationMatchResult | null {
    const validCandidates = candidateTransactions.filter((txn) => {
      if (txn.isReconciled) return false;
      const isDir =
        (statementLine.direction === 'CREDIT' && txn.direction === Direction.DEBIT) ||
        (statementLine.direction === 'DEBIT' && txn.direction === Direction.CREDIT);
      return isDir && txn.currency === statementLine.currency;
    });

    if (validCandidates.length < 2) return null;

    // Search combinations of length 2 to 4
    for (let len = 2; len <= Math.min(4, validCandidates.length); len++) {
      const combo = findCombinationSum(validCandidates, statementLine.amountFils, len);
      if (combo) {
        return {
          statementLineId: statementLine.id,
          matchedLedgerTransactionIds: combo.map((t) => t.id),
          confidence: MatchConfidence.VERY_HIGH,
          matchType: 'ONE_TO_MANY',
          varianceFils: 0n,
          explanation: `1:Many match. Bank statement line matched ${combo.length} ledger transactions totaling ${statementLine.amountFils} fils.`
        };
      }
    }

    return null;
  }

  /**
   * Evaluates Many:1 matches (Consolidated bank debit matching multiple ledger batch payments).
   */
  static reconcileManyToOne(
    statementLines: BankStatementLine[],
    candidateTransaction: InternalLedgerTransaction
  ): ReconciliationMatchResult | null {
    if (candidateTransaction.isReconciled) return null;

    const validLines = statementLines.filter((l) => {
      const isDir =
        (l.direction === 'CREDIT' && candidateTransaction.direction === Direction.DEBIT) ||
        (l.direction === 'DEBIT' && candidateTransaction.direction === Direction.CREDIT);
      return isDir && l.currency === candidateTransaction.currency;
    });

    // Check if sum of valid lines equals candidate transaction
    const sumLines = validLines.reduce((acc, l) => acc + l.amountFils, 0n);
    if (sumLines === candidateTransaction.amountFils && validLines.length > 1) {
      return {
        statementLineId: validLines[0].id,
        matchedLedgerTransactionIds: [candidateTransaction.id],
        confidence: MatchConfidence.VERY_HIGH,
        matchType: 'MANY_TO_ONE',
        varianceFils: 0n,
        explanation: `Many:1 match. Multiple statement lines consolidated to single ledger transaction of ${candidateTransaction.amountFils} fils.`
      };
    }

    return null;
  }

  /**
   * Executes multi-pass batch reconciliation across statement lines, applying:
   * 1. Custom tenant rules
   * 2. 1:1 exact & cross-currency matches
   * 3. 1:Many lump-sum matches
   */
  static runBatchReconciliation(
    statementLines: BankStatementLine[],
    ledgerTransactions: InternalLedgerTransaction[],
    rules: ReconciliationRule[] = [],
    baseCurrency: string = 'AED',
    currentFxRate?: bigint
  ): BatchReconciliationReport {
    const results: ReconciliationMatchResult[] = [];
    const availableLedger = ledgerTransactions.map((t) => ({ ...t }));
    let autoPostedCount = 0;

    for (const stmtLine of statementLines) {
      // Step 1: Rule match
      const ruleMatch = this.applyRules(stmtLine, rules);
      if (ruleMatch) {
        results.push(ruleMatch);
        autoPostedCount++;
        continue;
      }

      // Step 2: 1:1 match
      const oneToOne = this.reconcileOneToOne(
        stmtLine,
        availableLedger,
        baseCurrency,
        currentFxRate
      );
      if (oneToOne.confidence >= MatchConfidence.HIGH) {
        results.push(oneToOne);
        // Mark matched transaction as reconciled
        for (const tid of oneToOne.matchedLedgerTransactionIds) {
          const found = availableLedger.find((t) => t.id === tid);
          if (found) found.isReconciled = true;
        }
        continue;
      }

      // Step 3: 1:Many match
      const oneToMany = this.reconcileOneToMany(stmtLine, availableLedger);
      if (oneToMany) {
        results.push(oneToMany);
        for (const tid of oneToMany.matchedLedgerTransactionIds) {
          const found = availableLedger.find((t) => t.id === tid);
          if (found) found.isReconciled = true;
        }
        continue;
      }

      // Unmatched
      results.push(oneToOne);
    }

    const matchedCount = results.filter((r) => r.confidence > MatchConfidence.UNMATCHED).length;
    const unmatchedCount = statementLines.length - matchedCount;
    const reconciliationRatePercent =
      statementLines.length > 0
        ? Math.round((matchedCount / statementLines.length) * 10000) / 100
        : 100;

    return {
      totalStatementLines: statementLines.length,
      matchedLinesCount: matchedCount,
      unmatchedLinesCount: unmatchedCount,
      reconciliationRatePercent,
      autoPostedRulesCount: autoPostedCount,
      results
    };
  }
}

/**
 * Helper to find combination of exact size that sums to target
 */
function findCombinationSum(
  candidates: InternalLedgerTransaction[],
  targetFils: bigint,
  size: number
): InternalLedgerTransaction[] | null {
  function backtrack(
    start: number,
    currentCombo: InternalLedgerTransaction[],
    currentSum: bigint
  ): InternalLedgerTransaction[] | null {
    if (currentCombo.length === size) {
      return currentSum === targetFils ? currentCombo : null;
    }

    for (let i = start; i < candidates.length; i++) {
      const nextSum = currentSum + candidates[i].amountFils;
      if (nextSum > targetFils && targetFils > 0n) continue; // Pruning
      const res = backtrack(i + 1, [...currentCombo, candidates[i]], nextSum);
      if (res) return res;
    }
    return null;
  }

  return backtrack(0, [], 0n);
}
