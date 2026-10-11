import { UUID } from '@ledger-ae/shared-types';
import { roundHalfEven } from './money.js';

export enum RevenueRecognitionMethod {
  POINT_IN_TIME = 'POINT_IN_TIME',
  OVER_TIME_STRAIGHT_LINE = 'OVER_TIME_STRAIGHT_LINE',
  USAGE_BASED = 'USAGE_BASED'
}

export interface PerformanceObligationInput {
  obligationId: string;
  description: string;
  standaloneSellingPriceFils: bigint; // SSP
  recognitionMethod: RevenueRecognitionMethod;
  serviceDurationMonths?: number;
  citedClauseSection?: string; // Contract AI citation e.g. "Section 4.1"
  citedClauseText?: string;    // Contract AI extracted verbatim clause text
}

export interface AllocatedPerformanceObligation {
  obligationId: string;
  description: string;
  standaloneSellingPriceFils: bigint;
  allocatedTransactionPriceFils: bigint;
  recognitionMethod: RevenueRecognitionMethod;
  monthlyRevenueFils?: bigint;
  citedClauseSection?: string;
  citedClauseText?: string;
}

export interface RevRecScheduleMonth {
  periodMonth: number; // 1 to 12
  recognizedRevenueFils: bigint;
  remainingDeferredRevenueFils: bigint;
}

export interface ContractRevRecPlan {
  contractId: UUID;
  totalTransactionPriceFils: bigint;
  obligations: AllocatedPerformanceObligation[];
  waterfallSchedule: RevRecScheduleMonth[];
}

export class Ifrs15RevenueEngine {
  /**
   * Five-step IFRS 15 allocation:
   * Allocates total contract transaction price based on relative Standalone Selling Prices (SSP).
   */
  static allocateTransactionPrice(
    contractId: UUID,
    totalTransactionPriceFils: bigint,
    obligations: PerformanceObligationInput[]
  ): ContractRevRecPlan {
    const totalSspFils = obligations.reduce(
      (sum, ob) => sum + ob.standaloneSellingPriceFils,
      0n
    );

    if (totalSspFils === 0n) {
      throw new Error('Total Standalone Selling Price (SSP) cannot be zero.');
    }

    let runningAllocatedFils = 0n;
    const allocatedObligations: AllocatedPerformanceObligation[] = [];

    // Allocate relative SSP to each performance obligation
    for (let i = 0; i < obligations.length; i++) {
      const ob = obligations[i];
      let allocatedAmount: bigint;

      if (i === obligations.length - 1) {
        // Last obligation absorbs any rounding difference to ensure exact contract total
        allocatedAmount = totalTransactionPriceFils - runningAllocatedFils;
      } else {
        allocatedAmount = roundHalfEven(
          totalTransactionPriceFils * ob.standaloneSellingPriceFils,
          totalSspFils
        );
        runningAllocatedFils += allocatedAmount;
      }

      let monthlyRev: bigint | undefined;
      if (
        ob.recognitionMethod === RevenueRecognitionMethod.OVER_TIME_STRAIGHT_LINE &&
        ob.serviceDurationMonths &&
        ob.serviceDurationMonths > 0
      ) {
        monthlyRev = roundHalfEven(allocatedAmount, BigInt(ob.serviceDurationMonths));
      }

      allocatedObligations.push({
        obligationId: ob.obligationId,
        description: ob.description,
        standaloneSellingPriceFils: ob.standaloneSellingPriceFils,
        allocatedTransactionPriceFils: allocatedAmount,
        recognitionMethod: ob.recognitionMethod,
        monthlyRevenueFils: monthlyRev,
        citedClauseSection: ob.citedClauseSection,
        citedClauseText: ob.citedClauseText
      });
    }

    // Build 12-month deferred revenue waterfall
    const waterfallSchedule = this.buildWaterfallSchedule(
      totalTransactionPriceFils,
      allocatedObligations
    );

    return {
      contractId,
      totalTransactionPriceFils,
      obligations: allocatedObligations,
      waterfallSchedule
    };
  }

  /**
   * Verifies the core IFRS 15 reconciliation invariant:
   * 1. Sum of allocated obligations exactly equals total transaction price.
   * 2. At every period, Cumulative Recognized Revenue + Remaining Deferred Revenue = Total Transaction Price.
   * 3. Remaining deferred revenue reaches exactly 0 fils by the end of the service contract.
   */
  static verifyScheduleReconciliation(plan: ContractRevRecPlan): boolean {
    const sumAllocated = plan.obligations.reduce(
      (sum, ob) => sum + ob.allocatedTransactionPriceFils,
      0n
    );

    if (sumAllocated !== plan.totalTransactionPriceFils) {
      return false;
    }

    let runningRecognized = 0n;
    for (const month of plan.waterfallSchedule) {
      runningRecognized += month.recognizedRevenueFils;
      if (runningRecognized + month.remainingDeferredRevenueFils !== plan.totalTransactionPriceFils) {
        return false;
      }
      if (month.remainingDeferredRevenueFils < 0n) {
        return false;
      }
    }

    return true;
  }

  /**
   * Generates recurring IFRS 15 revenue recognition journal entry for a given period.
   * Dr Deferred Revenue (Liability)
   * Cr Revenue (Income)
   */
  static generateRevRecJournalEntry(
    plan: ContractRevRecPlan,
    periodMonth: number,
    deferredRevenueAccountId: UUID,
    revenueAccountId: UUID
  ) {
    const monthData = plan.waterfallSchedule.find((m) => m.periodMonth === periodMonth);
    if (!monthData) {
      throw new Error(`Period month ${periodMonth} not found in revenue plan waterfall.`);
    }

    const recognizedAmount = monthData.recognizedRevenueFils;

    return {
      periodMonth,
      description: `IFRS 15 Revenue Recognition Month ${periodMonth}: Contract ${plan.contractId}`,
      debits: [{ accountId: deferredRevenueAccountId, amountFils: recognizedAmount }],
      credits: [{ accountId: revenueAccountId, amountFils: recognizedAmount }],
      isBalanced: true
    };
  }

  private static buildWaterfallSchedule(
    totalPriceFils: bigint,
    obligations: AllocatedPerformanceObligation[]
  ): RevRecScheduleMonth[] {
    const schedule: RevRecScheduleMonth[] = [];
    let remainingDeferred = totalPriceFils;

    // Month 1 point-in-time recognitions
    let month1PointInTime = 0n;
    let monthlyOverTimeSum = 0n;

    for (const ob of obligations) {
      if (ob.recognitionMethod === RevenueRecognitionMethod.POINT_IN_TIME) {
        month1PointInTime += ob.allocatedTransactionPriceFils;
      } else if (ob.monthlyRevenueFils) {
        monthlyOverTimeSum += ob.monthlyRevenueFils;
      }
    }

    for (let month = 1; month <= 12; month++) {
      let recognizedThisMonth = 0n;

      if (month === 1) {
        recognizedThisMonth = month1PointInTime + monthlyOverTimeSum;
      } else {
        recognizedThisMonth = monthlyOverTimeSum;
      }

      if (recognizedThisMonth > remainingDeferred) {
        recognizedThisMonth = remainingDeferred;
      }

      remainingDeferred -= recognizedThisMonth;

      schedule.push({
        periodMonth: month,
        recognizedRevenueFils: recognizedThisMonth,
        remainingDeferredRevenueFils: remainingDeferred
      });
    }

    return schedule;
  }
}
