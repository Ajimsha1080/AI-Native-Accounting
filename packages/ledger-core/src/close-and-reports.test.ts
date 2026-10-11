import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CloseChecklistEngine,
  CloseTaskCategory,
  CloseTaskStatus
} from './close-checklist.js';
import {
  calculateStraightLineDepreciation,
  FixedAssetRecord
} from './fixed-assets.js';
import {
  FinancialReportBuilder,
  TrialBalanceAccountSummary
} from './report-builder.js';

describe('Continuous Close: Checklist Engine & Dependency Enforcement', () => {
  const engine = new CloseChecklistEngine();
  const periodId = 'period-2026-02';

  const task1 = {
    id: 'task-bank-rec',
    periodId,
    category: CloseTaskCategory.BANK_RECONCILIATION,
    title: 'Bank Reconciliation FAB & ENBD',
    assigneeUserId: 'usr-senior-01',
    status: CloseTaskStatus.PENDING,
    dependsOnTaskIds: [],
    isAiAutoCompletable: true
  };

  const task2 = {
    id: 'task-depreciation',
    periodId,
    category: CloseTaskCategory.FIXED_ASSETS_DEPRECIATION,
    title: 'Run Monthly Asset Depreciation',
    assigneeUserId: 'usr-senior-01',
    status: CloseTaskStatus.PENDING,
    dependsOnTaskIds: ['task-bank-rec'],
    isAiAutoCompletable: true
  };

  engine.addTask(task1);
  engine.addTask(task2);

  test('Cannot complete dependent task if prerequisite is pending', () => {
    const check = engine.canCompleteTask('task-depreciation');
    assert.equal(check.allowed, false);
    assert.match(check.reason!, /Prerequisite task/);
  });

  test('Completing prerequisite enables dependent task and marks period ready when all complete', () => {
    // Complete task 1
    engine.completeTask('task-bank-rec', 'All bank accounts reconciled to 0 fil variance');
    const check = engine.canCompleteTask('task-depreciation');
    assert.equal(check.allowed, true);

    // Complete task 2
    engine.completeTask('task-depreciation', 'Depreciation journal posted');
    assert.equal(engine.isPeriodReadyForClose(periodId), true);
  });
});

describe('Continuous Close: Fixed Assets Depreciation (IAS 16)', () => {
  test('Calculates monthly straight-line depreciation down to the fil', () => {
    // Asset: Server Rack Equipment
    // Cost: AED 120,000.00 (12,000,000 fils)
    // Salvage: AED 0
    // Life: 36 months (3 years)
    // Monthly depreciation = 12,000,000 / 36 = 333,333.333 -> 333,333 fils (3,333.33 AED)
    const asset: FixedAssetRecord = {
      assetId: 'asset-server-01',
      assetName: 'Server Rack Equipment',
      acquisitionDate: '2026-01-01',
      costFils: 12000000n,
      salvageValueFils: 0n,
      usefulLifeMonths: 36,
      accumulatedDepreciationFils: 0n,
      assetAccountId: 'acct-fixed-asset',
      accumDepreciationAccountId: 'acct-accum-dep',
      depreciationExpenseAccountId: 'acct-dep-exp'
    };

    const run1 = calculateStraightLineDepreciation(asset);
    assert.equal(run1.periodMonthlyDepreciationFils, 333333n); // AED 3,333.33
    assert.equal(run1.newAccumulatedDepreciationFils, 333333n);
    assert.equal(run1.remainingNetBookValueFils, 11666667n);
    assert.equal(run1.isFullyDepreciated, false);
  });
});

describe('Continuous Close: Financial Statement Report Builder', () => {
  const trialBalanceData: TrialBalanceAccountSummary[] = [
    {
      accountId: 'acc-cash',
      code: '10100',
      nameEn: 'Cash at Bank',
      nameAr: 'النقد في البنك',
      category: 'ASSET',
      debitBalanceBaseFils: 15000000n, // AED 150,000.00
      creditBalanceBaseFils: 0n
    },
    {
      accountId: 'acc-ar',
      code: '11000',
      nameEn: 'Accounts Receivable',
      nameAr: 'الذمم المدينة',
      category: 'ASSET',
      debitBalanceBaseFils: 5000000n, // AED 50,000.00
      creditBalanceBaseFils: 0n
    },
    {
      accountId: 'acc-ap',
      code: '20100',
      nameEn: 'Accounts Payable',
      nameAr: 'الذمم الدائنة',
      category: 'LIABILITY',
      debitBalanceBaseFils: 0n,
      creditBalanceBaseFils: 4000000n // AED 40,000.00
    },
    {
      accountId: 'acc-equity',
      code: '30100',
      nameEn: 'Share Capital',
      nameAr: 'رأس المال',
      category: 'EQUITY',
      debitBalanceBaseFils: 0n,
      creditBalanceBaseFils: 10000000n // AED 100,000.00
    },
    {
      accountId: 'acc-rev',
      code: '40100',
      nameEn: 'Consulting Revenue',
      nameAr: 'إيرادات الاستشارات',
      category: 'REVENUE',
      debitBalanceBaseFils: 0n,
      creditBalanceBaseFils: 8000000n // AED 80,000.00
    },
    {
      accountId: 'acc-exp',
      code: '50100',
      nameEn: 'Office Rent & Utilities',
      nameAr: 'إيجار المكتب والخدمات',
      category: 'EXPENSE',
      debitBalanceBaseFils: 2000000n, // AED 20,000.00
      creditBalanceBaseFils: 0n
    }
  ];

  test('Builds Income Statement and computes Net Profit', () => {
    const pnl = FinancialReportBuilder.buildIncomeStatement('2026-Q1', trialBalanceData);
    assert.equal(pnl.totalRevenueFils, 8000000n); // AED 80k
    assert.equal(pnl.totalExpensesFils, 2000000n); // AED 20k
    assert.equal(pnl.netProfitLossFils, 6000000n); // AED 60k profit
    assert.equal(pnl.formattedNetProfitLossAed, '60000.00');
  });

  test('Builds Balance Sheet and verifies fundamental accounting equation: Assets = Liabilities + Equity', () => {
    // Current period net profit = 60,000.00 AED (6,000,000 fils)
    const netProfitFils = 6000000n;
    const bs = FinancialReportBuilder.buildBalanceSheet('2026-03-31', trialBalanceData, netProfitFils);

    // Total Assets = Cash (150k) + AR (50k) = 200,000.00 AED (20,000,000 fils)
    assert.equal(bs.totalAssetsFils, 20000000n);

    // Total Liabilities = AP (40k) = 4,000,000 fils
    assert.equal(bs.totalLiabilitiesFils, 4000000n);

    // Total Equity = Capital (100k) + Net Profit (60k) = 160,000.00 AED (16,000,000 fils)
    assert.equal(bs.totalEquityFils, 16000000n);

    // 200,000.00 = 40,000.00 + 160,000.00
    assert.equal(bs.isBalanced, true);
  });
});
