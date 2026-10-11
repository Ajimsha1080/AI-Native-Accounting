import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateStraightLineDepreciation,
  calculateAssetDisposal,
  FixedAssetRecord,
  AssetDisposalInput
} from './fixed-assets.js';

describe('Milestone 11: IAS 16 Fixed Assets - Depreciation & Disposal Accounting', () => {
  test('Straight-Line Depreciation: Depreciates asset accurately and stops at salvage value', () => {
    // Delivery Van: Cost AED 120,000 (12,000,000 fils), Salvage AED 20,000 (2,000,000 fils)
    // Depreciable Amount: 10,000,000 fils
    // Useful Life: 50 Months -> Monthly Depreciation = 200,000 fils (AED 2,000.00)
    const asset: FixedAssetRecord = {
      assetId: 'asset-van-01',
      assetName: 'Mercedes Sprinter Delivery Van',
      acquisitionDate: '2025-01-01',
      costFils: 12000000n,
      salvageValueFils: 2000000n,
      usefulLifeMonths: 50,
      accumulatedDepreciationFils: 0n,
      assetAccountId: 'acc-asset-vehicles-01',
      accumDepreciationAccountId: 'acc-contra-accum-dep-vehicles-01',
      depreciationExpenseAccountId: 'acc-exp-dep-vehicles-01'
    };

    const period1 = calculateStraightLineDepreciation(asset);
    assert.equal(period1.periodMonthlyDepreciationFils, 200000n);
    assert.equal(period1.newAccumulatedDepreciationFils, 200000n);
    assert.equal(period1.remainingNetBookValueFils, 11800000n);
    assert.equal(period1.isFullyDepreciated, false);

    // Test capping when near salvage value
    const nearEndAsset: FixedAssetRecord = {
      ...asset,
      accumulatedDepreciationFils: 9900000n // Only 100,000 fils left to reach 10,000,000 depreciable limit
    };
    const lastPeriod = calculateStraightLineDepreciation(nearEndAsset);
    assert.equal(lastPeriod.periodMonthlyDepreciationFils, 100000n); // Capped at remaining depreciable amount
    assert.equal(lastPeriod.newAccumulatedDepreciationFils, 10000000n);
    assert.equal(lastPeriod.remainingNetBookValueFils, 2000000n); // Equals salvage value
    assert.equal(lastPeriod.isFullyDepreciated, true);
  });

  test('Asset Disposal with Gain: Generates balanced journal entry with Dr Bank, Dr Accum Dep, Cr Cost, Cr Gain', () => {
    // IT Server: Cost AED 60,000 (6,000,000 fils), Accum Dep AED 45,000 (4,500,000 fils)
    // Net Book Value: AED 15,000 (1,500,000 fils)
    // Sold for AED 20,000 (2,000,000 fils) -> Gain of AED 5,000 (500,000 fils)
    const asset: FixedAssetRecord = {
      assetId: 'asset-server-01',
      assetName: 'Dell PowerEdge Enterprise Server',
      acquisitionDate: '2023-01-01',
      costFils: 6000000n,
      salvageValueFils: 0n,
      usefulLifeMonths: 36,
      accumulatedDepreciationFils: 4500000n,
      assetAccountId: 'acc-asset-it-equipment-01',
      accumDepreciationAccountId: 'acc-contra-accum-dep-it-01',
      depreciationExpenseAccountId: 'acc-exp-dep-it-01'
    };

    const disposalInput: AssetDisposalInput = {
      asset,
      disposalDate: '2025-06-30',
      saleProceedsFils: 2000000n,
      bankAccountId: 'acc-asset-bank-enbd-01',
      gainOnDisposalAccountId: 'acc-inc-gain-on-disposal-01',
      lossOnDisposalAccountId: 'acc-exp-loss-on-disposal-01'
    };

    const result = calculateAssetDisposal(disposalInput);

    assert.equal(result.netBookValueFils, 1500000n);
    assert.equal(result.isGain, true);
    assert.equal(result.gainOrLossFils, 500000n); // AED 5,000 gain
    assert.equal(result.disposalJournalEntry.isBalanced, true);

    const debitsTotal = result.disposalJournalEntry.debits.reduce((s, d) => s + d.amountFils, 0n);
    const creditsTotal = result.disposalJournalEntry.credits.reduce((s, c) => s + c.amountFils, 0n);
    assert.equal(debitsTotal, creditsTotal);
    assert.equal(debitsTotal, 6500000n); // Dr Bank 2M + Dr AccumDep 4.5M = 6.5M; Cr Asset 6M + Cr Gain 0.5M = 6.5M
  });

  test('Asset Disposal with Loss: Generates balanced journal entry with Loss on Disposal', () => {
    // Machine: Cost AED 100,000, Accum Dep AED 30,000 -> NBV AED 70,000 (7,000,000 fils)
    // Sold for AED 50,000 (5,000,000 fils) -> Loss of AED 20,000 (2,000,000 fils)
    const asset: FixedAssetRecord = {
      assetId: 'asset-lathe-01',
      assetName: 'CNC Lathe Machine',
      acquisitionDate: '2024-01-01',
      costFils: 10000000n,
      salvageValueFils: 0n,
      usefulLifeMonths: 60,
      accumulatedDepreciationFils: 3000000n,
      assetAccountId: 'acc-asset-machinery-01',
      accumDepreciationAccountId: 'acc-contra-accum-dep-mach-01',
      depreciationExpenseAccountId: 'acc-exp-dep-mach-01'
    };

    const disposalInput: AssetDisposalInput = {
      asset,
      disposalDate: '2025-07-15',
      saleProceedsFils: 5000000n,
      bankAccountId: 'acc-asset-bank-adcb-01',
      gainOnDisposalAccountId: 'acc-inc-gain-on-disposal-01',
      lossOnDisposalAccountId: 'acc-exp-loss-on-disposal-01'
    };

    const result = calculateAssetDisposal(disposalInput);

    assert.equal(result.netBookValueFils, 7000000n);
    assert.equal(result.isGain, false);
    assert.equal(result.gainOrLossFils, 2000000n); // AED 20,000 loss
    assert.equal(result.disposalJournalEntry.isBalanced, true);

    const debitsTotal = result.disposalJournalEntry.debits.reduce((s, d) => s + d.amountFils, 0n);
    const creditsTotal = result.disposalJournalEntry.credits.reduce((s, c) => s + c.amountFils, 0n);
    assert.equal(debitsTotal, creditsTotal);
    assert.equal(debitsTotal, 10000000n); // Dr Bank 5M + Dr AccumDep 3M + Dr Loss 2M = 10M; Cr Asset 10M
  });
});
