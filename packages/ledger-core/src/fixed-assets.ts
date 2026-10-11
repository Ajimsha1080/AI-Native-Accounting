import { UUID } from '@ledger-ae/shared-types';
import { roundHalfEven } from './money.js';

export interface FixedAssetRecord {
  assetId: UUID;
  assetName: string;
  acquisitionDate: string; // 'YYYY-MM-DD'
  costFils: bigint;        // Acquisition cost
  salvageValueFils: bigint; // Residual value
  usefulLifeMonths: number;
  accumulatedDepreciationFils: bigint;
  assetAccountId: UUID;
  accumDepreciationAccountId: UUID;
  depreciationExpenseAccountId: UUID;
}

export interface DepreciationCalculationResult {
  assetId: UUID;
  periodMonthlyDepreciationFils: bigint;
  newAccumulatedDepreciationFils: bigint;
  remainingNetBookValueFils: bigint;
  isFullyDepreciated: boolean;
}

/**
 * Calculates Straight-Line Depreciation under IFRS (IAS 16).
 * All calculations are performed in integer minor units (fils).
 */
export function calculateStraightLineDepreciation(
  asset: FixedAssetRecord
): DepreciationCalculationResult {
  const depreciableAmount = asset.costFils - asset.salvageValueFils;

  if (depreciableAmount <= 0n || asset.usefulLifeMonths <= 0) {
    return {
      assetId: asset.assetId,
      periodMonthlyDepreciationFils: 0n,
      newAccumulatedDepreciationFils: asset.accumulatedDepreciationFils,
      remainingNetBookValueFils: asset.costFils - asset.accumulatedDepreciationFils,
      isFullyDepreciated: true
    };
  }

  // Monthly depreciation = depreciableAmount / usefulLifeMonths
  const standardMonthlyFils = roundHalfEven(
    depreciableAmount,
    BigInt(asset.usefulLifeMonths)
  );

  const remainingDepreciable = depreciableAmount - asset.accumulatedDepreciationFils;

  if (remainingDepreciable <= 0n) {
    return {
      assetId: asset.assetId,
      periodMonthlyDepreciationFils: 0n,
      newAccumulatedDepreciationFils: asset.accumulatedDepreciationFils,
      remainingNetBookValueFils: asset.costFils - asset.accumulatedDepreciationFils,
      isFullyDepreciated: true
    };
  }

  // Cap monthly depreciation so we do not exceed total depreciable amount
  const actualDepreciationFils =
    standardMonthlyFils > remainingDepreciable ? remainingDepreciable : standardMonthlyFils;

  const newAccum = asset.accumulatedDepreciationFils + actualDepreciationFils;
  const netBookValue = asset.costFils - newAccum;

  return {
    assetId: asset.assetId,
    periodMonthlyDepreciationFils: actualDepreciationFils,
    newAccumulatedDepreciationFils: newAccum,
    remainingNetBookValueFils: netBookValue,
    isFullyDepreciated: newAccum >= depreciableAmount
  };
}

export interface AssetDisposalInput {
  asset: FixedAssetRecord;
  disposalDate: string; // 'YYYY-MM-DD'
  saleProceedsFils: bigint;
  bankAccountId: UUID;
  gainOnDisposalAccountId: UUID;
  lossOnDisposalAccountId: UUID;
}

export interface AssetDisposalResult {
  assetId: UUID;
  costFils: bigint;
  accumulatedDepreciationFils: bigint;
  netBookValueFils: bigint;
  saleProceedsFils: bigint;
  isGain: boolean;
  gainOrLossFils: bigint;
  disposalJournalEntry: {
    description: string;
    debits: { accountId: UUID; amountFils: bigint }[];
    credits: { accountId: UUID; amountFils: bigint }[];
    isBalanced: boolean;
  };
}

/**
 * Handles asset derecognition and disposal under IAS 16.
 * Generates balanced disposal journal entries matching Debits == Credits.
 */
export function calculateAssetDisposal(input: AssetDisposalInput): AssetDisposalResult {
  const { asset, saleProceedsFils, bankAccountId, gainOnDisposalAccountId, lossOnDisposalAccountId } = input;
  const netBookValueFils = asset.costFils - asset.accumulatedDepreciationFils;
  const diff = saleProceedsFils - netBookValueFils;
  const isGain = diff >= 0n;
  const gainOrLossFils = isGain ? diff : -diff;

  const debits: { accountId: UUID; amountFils: bigint }[] = [];
  const credits: { accountId: UUID; amountFils: bigint }[] = [];

  // Dr Bank (Proceeds) if any
  if (saleProceedsFils > 0n) {
    debits.push({ accountId: bankAccountId, amountFils: saleProceedsFils });
  }

  // Dr Accumulated Depreciation (derecognize accumulated depreciation)
  if (asset.accumulatedDepreciationFils > 0n) {
    debits.push({ accountId: asset.accumDepreciationAccountId, amountFils: asset.accumulatedDepreciationFils });
  }

  // Cr Fixed Asset (derecognize gross historical cost)
  credits.push({ accountId: asset.assetAccountId, amountFils: asset.costFils });

  // Gain or Loss
  if (isGain && gainOrLossFils > 0n) {
    // Cr Gain on Disposal (Income)
    credits.push({ accountId: gainOnDisposalAccountId, amountFils: gainOrLossFils });
  } else if (!isGain && gainOrLossFils > 0n) {
    // Dr Loss on Disposal (Expense)
    debits.push({ accountId: lossOnDisposalAccountId, amountFils: gainOrLossFils });
  }

  const sumDebits = debits.reduce((s, d) => s + d.amountFils, 0n);
  const sumCredits = credits.reduce((s, c) => s + c.amountFils, 0n);

  return {
    assetId: asset.assetId,
    costFils: asset.costFils,
    accumulatedDepreciationFils: asset.accumulatedDepreciationFils,
    netBookValueFils,
    saleProceedsFils,
    isGain,
    gainOrLossFils,
    disposalJournalEntry: {
      description: `IAS 16 Asset Disposal: ${asset.assetName} on ${input.disposalDate}`,
      debits,
      credits,
      isBalanced: sumDebits === sumCredits
    }
  };
}
