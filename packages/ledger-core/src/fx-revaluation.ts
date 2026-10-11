import { UUID } from '@ledger-ae/shared-types';
import { roundHalfEven, convertCurrency } from './money.js';
import { Direction, JournalLineCandidate } from './invariants.js';

export interface MonetaryAccountBalance {
  accountId: UUID;
  currency: string; // Foreign currency (e.g. USD, EUR)
  foreignBalanceTxn: bigint; // minor units in foreign currency
  bookedBaseBalanceFils: bigint; // original booked AED balance
}

export interface FxRevaluationResult {
  accountId: UUID;
  foreignCurrency: string;
  foreignBalanceTxn: bigint;
  originalBookedBaseFils: bigint;
  revaluedBaseFils: bigint;
  unrealizedGainLossFils: bigint; // Positive = Gain, Negative = Loss
  isGain: boolean;
  adjustingJournalLine: JournalLineCandidate;
}

export class FxRevaluationEngine {
  /**
   * Revalues monetary foreign-currency balance sheet accounts at period-end closing rates (IAS 21).
   * Generates unrealized FX gain/loss journal adjustments to keep the general ledger true to closing exchange rates.
   */
  static revalueMonetaryAccount(
    periodId: UUID,
    account: MonetaryAccountBalance,
    closingFxRate: bigint, // scaled 10^8
    unrealizedGainLossAccountId: UUID,
    rateScale: bigint = 100000000n
  ): FxRevaluationResult {
    // New revalued base AED balance
    const revaluedBaseFils = convertCurrency(account.foreignBalanceTxn, closingFxRate, rateScale);
    const unrealizedGainLossFils = revaluedBaseFils - account.bookedBaseBalanceFils;
    const isGain = unrealizedGainLossFils >= 0n;
    const absDiff = unrealizedGainLossFils < 0n ? -unrealizedGainLossFils : unrealizedGainLossFils;

    // Adjusting line for unrealized gain/loss account
    const adjustingJournalLine: JournalLineCandidate = {
      accountId: unrealizedGainLossAccountId,
      currency: 'AED',
      amountTxn: absDiff,
      amountBase: absDiff,
      fxRate: rateScale,
      direction: isGain ? Direction.CREDIT : Direction.DEBIT,
      memo: `IAS 21 Period-End FX Revaluation (${account.currency} @ closing rate)`
    };

    return {
      accountId: account.accountId,
      foreignCurrency: account.currency,
      foreignBalanceTxn: account.foreignBalanceTxn,
      originalBookedBaseFils: account.bookedBaseBalanceFils,
      revaluedBaseFils,
      unrealizedGainLossFils,
      isGain,
      adjustingJournalLine
    };
  }
}
