import { UUID } from '@ledger-ae/shared-types';
import { Direction, JournalEntryCandidate, JournalLineCandidate } from './invariants.js';
import { TrialBalanceAccountSummary, FinancialStatementRow } from './report-builder.js';
import { convertCurrency, formatMoney } from './money.js';

export interface IntercompanyBalance {
  parentEntityId: UUID;
  subsidiaryEntityId: UUID;
  receivableAccountId: UUID;
  payableAccountId: UUID;
  intercompanyAmountFils: bigint;
  currency: string;
}

export interface ConsolidatedBalanceResult {
  unconsolidatedReceivablesFils: bigint;
  unconsolidatedPayablesFils: bigint;
  eliminatedAmountFils: bigint;
  netConsolidatedReceivablesFils: bigint;
  netConsolidatedPayablesFils: bigint;
  eliminationJournal: JournalEntryCandidate;
}

export interface ConsolidationEntity {
  entityId: UUID;
  entityName: string;
  jurisdiction: 'MAINLAND' | 'FREE_ZONE' | 'ADGM' | 'DIFC';
  functionalCurrency: string;
  ownershipPercentage: number; // e.g. 100 = 100%, 80 = 80% (20% NCI)
  fxRateToBase: bigint; // e.g. 100000000n for 1.0 (AED), 367250000n for 3.6725 (USD)
  trialBalance: TrialBalanceAccountSummary[];
}

export interface IntercompanyEliminationPair {
  entityFromId: UUID;
  entityToId: UUID;
  type: 'LOAN_RECEIVABLE_PAYABLE' | 'MANAGEMENT_FEE' | 'DIVIDEND';
  amountFils: bigint;
  currency: string;
  fromAccountId: UUID;
  toAccountId: UUID;
}

export interface GroupConsolidationReport {
  periodId: string;
  entitiesCount: number;
  consolidatedCurrency: 'AED';
  unconsolidatedTotalAssetsFils: bigint;
  unconsolidatedTotalLiabilitiesFils: bigint;
  totalEliminationsFils: bigint;
  eliminationJournals: JournalEntryCandidate[];
  consolidatedAssetsFils: bigint;
  consolidatedLiabilitiesFils: bigint;
  consolidatedEquityFils: bigint;
  nonControllingInterestFils: bigint; // NCI (IAS 27 / IFRS 10)
  consolidatedRevenueFils: bigint;
  consolidatedExpensesFils: bigint;
  consolidatedNetProfitFils: bigint;
  isBalanced: boolean;
  consolidationLatencyMs: number;
  entityBreakdowns: Array<{
    entityId: UUID;
    entityName: string;
    jurisdiction: string;
    currency: string;
    localAssetsFils: bigint;
    baseAssetsFils: bigint;
    localRevenueFils: bigint;
    baseRevenueFils: bigint;
  }>;
}

export class ConsolidationEngine {
  /**
   * Generates automated intercompany elimination journal entries.
   * Cancels out reciprocal balances between parent and subsidiary entities under IFRS 10.
   */
  static eliminateIntercompanyBalances(
    periodId: UUID,
    intercompany: IntercompanyBalance,
    eliminationBookId: UUID
  ): ConsolidatedBalanceResult {
    const eliminated = intercompany.intercompanyAmountFils;

    const eliminationLines: JournalLineCandidate[] = [
      {
        accountId: intercompany.payableAccountId,
        currency: intercompany.currency,
        amountTxn: eliminated,
        amountBase: eliminated,
        fxRate: 100000000n,
        direction: Direction.DEBIT,
        memo: 'Intercompany Elimination: Dr Intercompany AP'
      },
      {
        accountId: intercompany.receivableAccountId,
        currency: intercompany.currency,
        amountTxn: eliminated,
        amountBase: eliminated,
        fxRate: 100000000n,
        direction: Direction.CREDIT,
        memo: 'Intercompany Elimination: Cr Intercompany AR'
      }
    ];

    const eliminationJournal: JournalEntryCandidate = {
      tenantId: 'ten-group-01',
      entityId: intercompany.parentEntityId,
      bookId: eliminationBookId,
      periodId,
      entryNumber: `ELIM-JV-${periodId.slice(0, 8)}`,
      postingDate: '2026-03-31',
      documentDate: '2026-03-31',
      sourceModule: 'CONSOLIDATION',
      memoEn: 'Automated Intercompany Elimination Entry (IFRS 10)',
      memoAr: 'قيد الاستبعاد التلقائي للحسابات البينية للشركات الشقيقة',
      createdBy: 'consolidation-engine',
      lines: eliminationLines
    };

    return {
      unconsolidatedReceivablesFils: eliminated,
      unconsolidatedPayablesFils: eliminated,
      eliminatedAmountFils: eliminated,
      netConsolidatedReceivablesFils: 0n,
      netConsolidatedPayablesFils: 0n,
      eliminationJournal
    };
  }

  /**
   * Consolidates a group of entities (e.g. 10 entities) under IFRS 10 with:
   * 1. Multi-currency translation (IAS 21) into base AED.
   * 2. Full intercompany elimination of reciprocal loans, management fees, and dividends.
   * 3. Non-Controlling Interest (NCI) allocation for non-wholly owned subsidiaries.
   * 4. Verification that Consolidated Assets = Consolidated Liabilities + Consolidated Equity.
   */
  static consolidateGroup(
    periodId: string,
    entities: ConsolidationEntity[],
    intercompanyPairs: IntercompanyEliminationPair[] = [],
    eliminationBookId: UUID = 'book-elim-01'
  ): GroupConsolidationReport {
    const startTime = Date.now();

    let unconsolidatedTotalAssets = 0n;
    let unconsolidatedTotalLiabilities = 0n;
    let unconsolidatedTotalEquity = 0n;
    let unconsolidatedTotalRevenue = 0n;
    let unconsolidatedTotalExpenses = 0n;
    let totalNciEquity = 0n;

    const entityBreakdowns: GroupConsolidationReport['entityBreakdowns'] = [];

    // Step 1: Translate and Aggregate each entity into base currency (AED)
    for (const entity of entities) {
      let entLocalAssets = 0n;
      let entLocalLiab = 0n;
      let entLocalEq = 0n;
      let entLocalRev = 0n;
      let entLocalExp = 0n;

      for (const acc of entity.trialBalance) {
        if (acc.category === 'ASSET') {
          entLocalAssets += acc.debitBalanceBaseFils - acc.creditBalanceBaseFils;
        } else if (acc.category === 'LIABILITY') {
          entLocalLiab += acc.creditBalanceBaseFils - acc.debitBalanceBaseFils;
        } else if (acc.category === 'EQUITY') {
          entLocalEq += acc.creditBalanceBaseFils - acc.debitBalanceBaseFils;
        } else if (acc.category === 'REVENUE') {
          entLocalRev += acc.creditBalanceBaseFils - acc.debitBalanceBaseFils;
        } else if (acc.category === 'EXPENSE') {
          entLocalExp += acc.debitBalanceBaseFils - acc.creditBalanceBaseFils;
        }
      }

      // Convert to AED base using IAS 21 rate
      const baseAssets =
        entity.functionalCurrency === 'AED'
          ? entLocalAssets
          : convertCurrency(entLocalAssets, entity.fxRateToBase);

      const baseLiab =
        entity.functionalCurrency === 'AED'
          ? entLocalLiab
          : convertCurrency(entLocalLiab, entity.fxRateToBase);

      const baseEq =
        entity.functionalCurrency === 'AED'
          ? entLocalEq
          : convertCurrency(entLocalEq, entity.fxRateToBase);

      const baseRev =
        entity.functionalCurrency === 'AED'
          ? entLocalRev
          : convertCurrency(entLocalRev, entity.fxRateToBase);

      const baseExp =
        entity.functionalCurrency === 'AED'
          ? entLocalExp
          : convertCurrency(entLocalExp, entity.fxRateToBase);

      unconsolidatedTotalAssets += baseAssets;
      unconsolidatedTotalLiabilities += baseLiab;
      unconsolidatedTotalEquity += baseEq;
      unconsolidatedTotalRevenue += baseRev;
      unconsolidatedTotalExpenses += baseExp;

      // NCI calculation (e.g. if 80% owned, 20% belongs to Non-Controlling Interest)
      if (entity.ownershipPercentage < 100) {
        const nciPercent = BigInt(100 - entity.ownershipPercentage);
        const subTotalEquity = baseEq + (baseRev - baseExp);
        const nciShare = (subTotalEquity * nciPercent) / 100n;
        totalNciEquity += nciShare;
        unconsolidatedTotalEquity -= nciShare; // Transfer to NCI
      }

      entityBreakdowns.push({
        entityId: entity.entityId,
        entityName: entity.entityName,
        jurisdiction: entity.jurisdiction,
        currency: entity.functionalCurrency,
        localAssetsFils: entLocalAssets,
        baseAssetsFils: baseAssets,
        localRevenueFils: entLocalRev,
        baseRevenueFils: baseRev
      });
    }

    // Step 2: Process Intercompany Eliminations (IFRS 10)
    let totalEliminations = 0n;
    const eliminationJournals: JournalEntryCandidate[] = [];

    for (const pair of intercompanyPairs) {
      totalEliminations += pair.amountFils;

      const elimJournal: JournalEntryCandidate = {
        tenantId: 'ten-group-01',
        entityId: pair.entityFromId,
        bookId: eliminationBookId,
        periodId,
        entryNumber: `ELIM-PAIR-${pair.entityFromId.slice(0, 4)}-${pair.entityToId.slice(0, 4)}`,
        postingDate: '2026-03-31',
        documentDate: '2026-03-31',
        sourceModule: 'CONSOLIDATION',
        memoEn: `Elimination of ${pair.type} between ${pair.entityFromId} and ${pair.entityToId}`,
        memoAr: `استبعاد العمليات البينية بين الكيانات الشقيقة`,
        createdBy: 'consolidation-engine',
        lines: [
          {
            accountId: pair.toAccountId,
            currency: 'AED',
            amountTxn: pair.amountFils,
            amountBase: pair.amountFils,
            fxRate: 100000000n,
            direction: Direction.DEBIT,
            memo: 'Dr Intercompany Elimination'
          },
          {
            accountId: pair.fromAccountId,
            currency: 'AED',
            amountTxn: pair.amountFils,
            amountBase: pair.amountFils,
            fxRate: 100000000n,
            direction: Direction.CREDIT,
            memo: 'Cr Intercompany Elimination'
          }
        ]
      };
      eliminationJournals.push(elimJournal);
    }

    // Apply eliminations to balance sheet
    const consolidatedAssets = unconsolidatedTotalAssets - totalEliminations;
    const consolidatedLiabilities = unconsolidatedTotalLiabilities - totalEliminations;

    const consolidatedNetProfit = unconsolidatedTotalRevenue - unconsolidatedTotalExpenses;
    const consolidatedEquity = unconsolidatedTotalEquity + consolidatedNetProfit;

    // Verify Fundamental Accounting Invariant: Assets == Liabilities + Equity + NCI
    const isBalanced =
      consolidatedAssets === consolidatedLiabilities + consolidatedEquity + totalNciEquity;

    const latency = Date.now() - startTime;

    return {
      periodId,
      entitiesCount: entities.length,
      consolidatedCurrency: 'AED',
      unconsolidatedTotalAssetsFils: unconsolidatedTotalAssets,
      unconsolidatedTotalLiabilitiesFils: unconsolidatedTotalLiabilities,
      totalEliminationsFils: totalEliminations,
      eliminationJournals,
      consolidatedAssetsFils: consolidatedAssets,
      consolidatedLiabilitiesFils: consolidatedLiabilities,
      consolidatedEquityFils: consolidatedEquity,
      nonControllingInterestFils: totalNciEquity,
      consolidatedRevenueFils: unconsolidatedTotalRevenue,
      consolidatedExpensesFils: unconsolidatedTotalExpenses,
      consolidatedNetProfitFils: consolidatedNetProfit,
      isBalanced,
      consolidationLatencyMs: latency,
      entityBreakdowns
    };
  }
}
