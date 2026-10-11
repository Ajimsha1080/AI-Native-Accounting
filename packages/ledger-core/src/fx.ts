import { UUID } from '@ledger-ae/shared-types';
import { convertCurrency, roundHalfEven } from './money.js';
import { Direction, JournalLineCandidate } from './invariants.js';

export interface MultiCurrencyLineInput {
  accountId: UUID;
  currency: string;
  amountTxn: bigint;
  fxRate: bigint; // scaled 10^8
  direction: Direction;
  dimensionCostCenterId?: UUID;
}

export interface BalancedMultiCurrencyEntry {
  lines: JournalLineCandidate[];
  fxRoundingLine?: JournalLineCandidate;
  totalDebitsBase: bigint;
  totalCreditsBase: bigint;
}

/**
 * Builds balanced journal lines from multi-currency line inputs.
 * Calculates base AED amounts deterministically with Banker's Rounding,
 * and automatically generates an FX Rounding line to the specified FX rounding account
 * if sub-fil rounding drift occurs.
 */
export function buildBalancedMultiCurrencyLines(
  inputs: MultiCurrencyLineInput[],
  fxRoundingAccountId: UUID,
  rateScale: bigint = 100000000n
): BalancedMultiCurrencyEntry {
  let totalDebitsBase = 0n;
  let totalCreditsBase = 0n;

  const lines: JournalLineCandidate[] = inputs.map((input) => {
    // Convert to base AED using deterministic Banker's Rounding
    const amountBase = convertCurrency(input.amountTxn, input.fxRate, rateScale);

    if (input.direction === Direction.DEBIT) {
      totalDebitsBase += amountBase;
    } else {
      totalCreditsBase += amountBase;
    }

    return {
      accountId: input.accountId,
      currency: input.currency,
      amountTxn: input.amountTxn,
      amountBase,
      fxRate: input.fxRate,
      direction: input.direction,
      dimensionCostCenterId: input.dimensionCostCenterId
    };
  });

  const differenceBase = totalDebitsBase - totalCreditsBase;
  let fxRoundingLine: JournalLineCandidate | undefined;

  // If there is an FX conversion rounding difference (e.g. 1 fil), balance it into the FX Rounding Account
  if (differenceBase !== 0n) {
    if (differenceBase > 0n) {
      // Debits exceed credits by differenceBase -> add Credit to FX Rounding Account
      fxRoundingLine = {
        accountId: fxRoundingAccountId,
        currency: 'AED',
        amountTxn: differenceBase,
        amountBase: differenceBase,
        fxRate: rateScale, // 1.00000000
        direction: Direction.CREDIT,
        memo: 'Deterministic FX rounding balance adjustment'
      };
      totalCreditsBase += differenceBase;
    } else {
      // Credits exceed debits -> add Debit to FX Rounding Account
      const absDiff = -differenceBase;
      fxRoundingLine = {
        accountId: fxRoundingAccountId,
        currency: 'AED',
        amountTxn: absDiff,
        amountBase: absDiff,
        fxRate: rateScale,
        direction: Direction.DEBIT,
        memo: 'Deterministic FX rounding balance adjustment'
      };
      totalDebitsBase += absDiff;
    }

    lines.push(fxRoundingLine);
  }

  return {
    lines,
    fxRoundingLine,
    totalDebitsBase,
    totalCreditsBase
  };
}
