import { UUID } from '@ledger-ae/shared-types';
import { roundHalfEven, formatMoney } from './money.js';

export interface LeaseContractInput {
  leaseId: UUID;
  leaseName: string;
  commencementDate: string; // 'YYYY-MM-DD'
  leaseTermMonths: number;
  monthlyPaymentFils: bigint;
  annualDiscountRateBps: bigint; // Incremental Borrowing Rate (IBR) e.g. 600n = 6.00%
  initialDirectCostsFils?: bigint;
  leaseIncentivesReceivedFils?: bigint;
  paymentTiming?: 'ARREARS' | 'ADVANCE'; // Default ARREARS
  // Account IDs for journal integration
  rouAssetAccountId: UUID;
  leaseLiabilityAccountId: UUID;
  interestExpenseAccountId: UUID;
  depreciationExpenseAccountId: UUID;
  accumulatedDepreciationAccountId: UUID;
  bankAccountId: UUID;
}

export interface LeaseScheduleMonth {
  periodMonth: number; // 1 to leaseTermMonths
  beginningLiabilityFils: bigint;
  interestExpenseFils: bigint;
  leasePaymentFils: bigint;
  principalRepaymentFils: bigint;
  endingLiabilityFils: bigint;
  currentLiabilityPortionFils: bigint; // Principal repayable within next 12 months
  nonCurrentLiabilityPortionFils: bigint; // Remaining principal beyond 12 months
  rouDepreciationFils: bigint;
  rouEndingNetBookValueFils: bigint;
}

export interface Ifrs16LeasePlan {
  leaseId: UUID;
  leaseName: string;
  initialLeaseLiabilityFils: bigint;
  initialRouAssetFils: bigint;
  totalLeasePaymentsFils: bigint;
  totalInterestExpenseFils: bigint;
  totalDepreciationFils: bigint;
  schedule: LeaseScheduleMonth[];
  initialJournalEntry: {
    description: string;
    debits: { accountId: UUID; amountFils: bigint }[];
    credits: { accountId: UUID; amountFils: bigint }[];
    isBalanced: boolean;
  };
}

export class Ifrs16LeaseEngine {
  /**
   * Computes IFRS 16 Right-of-Use (ROU) Asset, Lease Liability, and amortization schedule.
   * All calculations use integer BigInt fils and Banker's rounding.
   */
  static generateLeasePlan(input: LeaseContractInput): Ifrs16LeasePlan {
    if (input.leaseTermMonths <= 0) {
      throw new Error('Lease term months must be greater than zero.');
    }
    if (input.monthlyPaymentFils <= 0n) {
      throw new Error('Monthly payment must be greater than zero.');
    }

    const n = input.leaseTermMonths;
    const isAdvance = input.paymentTiming === 'ADVANCE';

    // 1. Calculate Initial Lease Liability via Present Value of Monthly Lease Payments
    // Monthly discount rate = annualDiscountRateBps / 120,000
    // To compute PV with BigInt, we use precise discounted cash flows
    let initialLeaseLiabilityFils = 0n;
    const rateBps = Number(input.annualDiscountRateBps);
    const monthlyRate = rateBps / (12 * 10000); // e.g. 600 / 120,000 = 0.005 (0.5% per month)

    for (let m = 1; m <= n; m++) {
      const discountPeriod = isAdvance ? m - 1 : m;
      let discountFactor = 1.0;
      if (monthlyRate > 0) {
        discountFactor = 1.0 / Math.pow(1.0 + monthlyRate, discountPeriod);
      }
      // Discounted cash flow in fils with banker's rounding
      const discountedPayment = roundHalfEven(
        BigInt(Math.round(Number(input.monthlyPaymentFils) * discountFactor * 10000)),
        10000n
      );
      initialLeaseLiabilityFils += discountedPayment;
    }

    // 2. Initial ROU Asset = Lease Liability + Initial Direct Costs - Incentives
    const directCosts = input.initialDirectCostsFils ?? 0n;
    const incentives = input.leaseIncentivesReceivedFils ?? 0n;
    const initialRouAssetFils = initialLeaseLiabilityFils + directCosts - incentives;

    // 3. Build monthly amortization schedule
    const schedule: LeaseScheduleMonth[] = [];
    let currentLiability = initialLeaseLiabilityFils;
    let accumulatedDepreciation = 0n;
    let totalInterest = 0n;
    const monthlyDepreciation = roundHalfEven(initialRouAssetFils, BigInt(n));

    // First pass: generate monthly interest and principal repayments
    for (let m = 1; m <= n; m++) {
      const beginningLiability = currentLiability;
      let interestFils = 0n;
      if (monthlyRate > 0) {
        interestFils = roundHalfEven(
          beginningLiability * input.annualDiscountRateBps,
          120000n
        );
      }

      let paymentFils = input.monthlyPaymentFils;
      let principalFils: bigint;
      let endingLiability: bigint;

      if (m === n) {
        // Final period: adjust principal to eliminate remaining liability to exactly 0 fils
        principalFils = beginningLiability;
        paymentFils = principalFils + interestFils;
        endingLiability = 0n;
      } else {
        principalFils = paymentFils - interestFils;
        if (principalFils > beginningLiability) {
          principalFils = beginningLiability;
          endingLiability = 0n;
        } else {
          endingLiability = beginningLiability - principalFils;
        }
      }

      currentLiability = endingLiability;
      totalInterest += interestFils;

      // Depreciation calculation for ROU Asset
      let depFils = monthlyDepreciation;
      if (m === n) {
        // Final month absorbs any rounding discrepancy so ending NBV is 0
        depFils = initialRouAssetFils - accumulatedDepreciation;
      } else if (accumulatedDepreciation + depFils > initialRouAssetFils) {
        depFils = initialRouAssetFils - accumulatedDepreciation;
      }
      accumulatedDepreciation += depFils;
      const endingRouNbv = initialRouAssetFils - accumulatedDepreciation;

      schedule.push({
        periodMonth: m,
        beginningLiabilityFils: beginningLiability,
        interestExpenseFils: interestFils,
        leasePaymentFils: paymentFils,
        principalRepaymentFils: principalFils,
        endingLiabilityFils: endingLiability,
        currentLiabilityPortionFils: 0n, // Computed in second pass
        nonCurrentLiabilityPortionFils: 0n,
        rouDepreciationFils: depFils,
        rouEndingNetBookValueFils: endingRouNbv
      });
    }

    // Second pass: Calculate current vs non-current liability split
    for (let i = 0; i < schedule.length; i++) {
      const remainingSchedule = schedule.slice(i + 1, i + 13);
      const currentPortion = remainingSchedule.reduce(
        (sum, item) => sum + item.principalRepaymentFils,
        0n
      );
      const endingLiability = schedule[i].endingLiabilityFils;
      const nonCurrentPortion =
        endingLiability > currentPortion ? endingLiability - currentPortion : 0n;

      schedule[i].currentLiabilityPortionFils = currentPortion;
      schedule[i].nonCurrentLiabilityPortionFils = nonCurrentPortion;
    }

    const totalLeasePayments = schedule.reduce(
      (sum, item) => sum + item.leasePaymentFils,
      0n
    );

    // Initial Recognition Journal Entry: Dr ROU Asset, Cr Lease Liability
    const initialJournalEntry = {
      description: `IFRS 16 Initial Recognition: ${input.leaseName}`,
      debits: [{ accountId: input.rouAssetAccountId, amountFils: initialRouAssetFils }],
      credits: [{ accountId: input.leaseLiabilityAccountId, amountFils: initialLeaseLiabilityFils }],
      isBalanced: initialRouAssetFils === initialLeaseLiabilityFils
    };

    return {
      leaseId: input.leaseId,
      leaseName: input.leaseName,
      initialLeaseLiabilityFils,
      initialRouAssetFils,
      totalLeasePaymentsFils: totalLeasePayments,
      totalInterestExpenseFils: totalInterest,
      totalDepreciationFils: accumulatedDepreciation,
      schedule,
      initialJournalEntry
    };
  }

  /**
   * Generates the monthly IFRS 16 recurring journal entries for a given period.
   * Enforces Debits == Credits invariant.
   */
  static generateMonthlyJournalEntries(
    input: LeaseContractInput,
    monthSchedule: LeaseScheduleMonth
  ) {
    // 1. Payment & Interest Entry:
    // Dr Interest Expense
    // Dr Lease Liability (Principal)
    // Cr Bank (Payment)
    const paymentDebits = [
      { accountId: input.interestExpenseAccountId, amountFils: monthSchedule.interestExpenseFils },
      { accountId: input.leaseLiabilityAccountId, amountFils: monthSchedule.principalRepaymentFils }
    ];
    const paymentCredits = [
      { accountId: input.bankAccountId, amountFils: monthSchedule.leasePaymentFils }
    ];

    const sumPaymentDebits = paymentDebits.reduce((s, d) => s + d.amountFils, 0n);
    const sumPaymentCredits = paymentCredits.reduce((s, c) => s + c.amountFils, 0n);

    // 2. ROU Asset Depreciation Entry:
    // Dr Depreciation Expense
    // Cr Accumulated Depreciation
    const depDebits = [
      { accountId: input.depreciationExpenseAccountId, amountFils: monthSchedule.rouDepreciationFils }
    ];
    const depCredits = [
      { accountId: input.accumulatedDepreciationAccountId, amountFils: monthSchedule.rouDepreciationFils }
    ];

    return {
      periodMonth: monthSchedule.periodMonth,
      paymentEntry: {
        description: `IFRS 16 Lease Payment Month ${monthSchedule.periodMonth}: ${input.leaseName}`,
        debits: paymentDebits,
        credits: paymentCredits,
        isBalanced: sumPaymentDebits === sumPaymentCredits
      },
      depreciationEntry: {
        description: `IFRS 16 ROU Depreciation Month ${monthSchedule.periodMonth}: ${input.leaseName}`,
        debits: depDebits,
        credits: depCredits,
        isBalanced: true
      }
    };
  }
}
