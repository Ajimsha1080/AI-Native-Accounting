import { UUID } from '@ledger-ae/shared-types';

export enum Direction {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT'
}

export interface JournalLineCandidate {
  accountId: UUID;
  currency: string;
  amountTxn: bigint;
  amountBase: bigint;
  fxRate: bigint; // scaled 10^8
  direction: Direction;
  vatCode?: string;
  vatRateBps?: number;
  vatAmountBase?: bigint;
  dimensionProjectId?: UUID;
  dimensionCostCenterId?: UUID;
  dimensionLocationId?: UUID;
  memo?: string;
}

export interface JournalEntryCandidate {
  tenantId: UUID;
  entityId: UUID;
  bookId: UUID;
  periodId: UUID;
  entryNumber: string;
  postingDate: string; // ISO date 'YYYY-MM-DD'
  documentDate: string;
  sourceModule: string;
  sourceId?: UUID;
  memoEn: string;
  memoAr?: string;
  createdBy: UUID;
  lines: JournalLineCandidate[];
  previousEntryHash?: string;
}

export interface InvariantValidationResult {
  isValid: boolean;
  totalDebitsBase: bigint;
  totalCreditsBase: bigint;
  differenceBase: bigint;
  errors: string[];
}

/**
 * Validates General Ledger invariants:
 * 1. Must contain at least two lines.
 * 2. Total base debits must exactly equal total base credits.
 * 3. All amounts must be non-negative.
 * 4. Transaction amounts for single-currency entries must balance.
 */
export function validateLedgerInvariants(entry: JournalEntryCandidate): InvariantValidationResult {
  const errors: string[] = [];

  if (!entry.lines || entry.lines.length < 2) {
    errors.push('Journal entry must contain at least 2 lines (double-entry requirement).');
    return {
      isValid: false,
      totalDebitsBase: 0n,
      totalCreditsBase: 0n,
      differenceBase: 0n,
      errors
    };
  }

  let totalDebitsBase = 0n;
  let totalCreditsBase = 0n;

  // Track per-currency transaction totals
  const txnTotals = new Map<string, { debits: bigint; credits: bigint }>();

  for (let i = 0; i < entry.lines.length; i++) {
    const line = entry.lines[i];

    if (line.amountBase < 0n || line.amountTxn < 0n) {
      errors.push(`Line ${i + 1}: Negative amounts are forbidden. Use opposite direction.`);
    }

    if (line.direction === Direction.DEBIT) {
      totalDebitsBase += line.amountBase;
    } else if (line.direction === Direction.CREDIT) {
      totalCreditsBase += line.amountBase;
    } else {
      errors.push(`Line ${i + 1}: Direction must be DEBIT or CREDIT.`);
    }

    // Accumulate transaction currency
    const curr = line.currency;
    if (!txnTotals.has(curr)) {
      txnTotals.set(curr, { debits: 0n, credits: 0n });
    }
    const currBal = txnTotals.get(curr)!;
    if (line.direction === Direction.DEBIT) {
      currBal.debits += line.amountTxn;
    } else {
      currBal.credits += line.amountTxn;
    }
  }

  const differenceBase = totalDebitsBase - totalCreditsBase;
  if (differenceBase !== 0n) {
    errors.push(
      `Ledger Invariant Violation: Debits (${totalDebitsBase.toString()}) do not equal Credits (${totalCreditsBase.toString()}). Variance = ${differenceBase.toString()} minor units.`
    );
  }

  // If all lines are in the exact same single currency, ensure transaction amounts balance too
  if (txnTotals.size === 1) {
    const [curr, totals] = Array.from(txnTotals.entries())[0];
    if (totals.debits !== totals.credits) {
      errors.push(
        `Single-currency transaction imbalance in ${curr}: Debits (${totals.debits}) != Credits (${totals.credits}).`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    totalDebitsBase,
    totalCreditsBase,
    differenceBase,
    errors
  };
}
