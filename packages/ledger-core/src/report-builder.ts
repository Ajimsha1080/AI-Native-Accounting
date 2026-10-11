import { UUID } from '@ledger-ae/shared-types';
import { formatMoney } from './money.js';

export interface TrialBalanceAccountSummary {
  accountId: UUID;
  code: string;
  nameEn: string;
  nameAr: string;
  category: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  debitBalanceBaseFils: bigint;
  creditBalanceBaseFils: bigint;
}

export interface StatementRowDrillDownVoucher {
  voucherId: UUID;
  voucherNumber: string;
  date: string;
  accountCode: string;
  amountFils: bigint;
  narration: string;
}

export interface FinancialStatementRow {
  accountId?: UUID;
  accountCode?: string;
  labelEn: string;
  labelAr: string;
  amountFils: bigint;
  formattedAed: string;
  isTotalHeader?: boolean;
  drillDownVouchers?: StatementRowDrillDownVoucher[];
}

export interface IncomeStatementReport {
  period: string;
  revenueRows: FinancialStatementRow[];
  totalRevenueFils: bigint;
  expenseRows: FinancialStatementRow[];
  totalExpensesFils: bigint;
  netProfitLossFils: bigint;
  formattedNetProfitLossAed: string;
}

export interface BalanceSheetReport {
  asOfDate: string;
  assetRows: FinancialStatementRow[];
  totalAssetsFils: bigint;
  liabilityRows: FinancialStatementRow[];
  totalLiabilitiesFils: bigint;
  equityRows: FinancialStatementRow[];
  totalEquityFils: bigint;
  isBalanced: boolean;
}

export interface MultiBookComparativeRow {
  accountCode: string;
  accountName: string;
  ifrsAmountFils: bigint;
  taxBookAmountFils: bigint;
  managementAmountFils: bigint;
  taxVarianceFils: bigint;
  taxAdjustmentRationale?: string;
}

export interface MultiBookComparativeReport {
  period: string;
  rows: MultiBookComparativeRow[];
  totalIfrsProfitFils: bigint;
  totalTaxableIncomeFils: bigint;
  totalManagementProfitFils: bigint;
  netTaxAdjustmentsFils: bigint;
}

export class FinancialReportBuilder {
  /**
   * Generates Income Statement (Profit & Loss) from account summaries with drill-down vouchers.
   */
  static buildIncomeStatement(
    period: string,
    summaries: TrialBalanceAccountSummary[],
    sourceVouchersMap?: Map<UUID, StatementRowDrillDownVoucher[]>
  ): IncomeStatementReport {
    const revenueRows: FinancialStatementRow[] = [];
    let totalRevenueFils = 0n;

    const expenseRows: FinancialStatementRow[] = [];
    let totalExpensesFils = 0n;

    for (const acc of summaries) {
      const vouchers = sourceVouchersMap?.get(acc.accountId) ?? [];

      if (acc.category === 'REVENUE') {
        const netRev = acc.creditBalanceBaseFils - acc.debitBalanceBaseFils;
        totalRevenueFils += netRev;
        revenueRows.push({
          accountId: acc.accountId,
          accountCode: acc.code,
          labelEn: acc.nameEn,
          labelAr: acc.nameAr,
          amountFils: netRev,
          formattedAed: formatMoney(netRev, 'AED'),
          drillDownVouchers: vouchers
        });
      } else if (acc.category === 'EXPENSE') {
        const netExp = acc.debitBalanceBaseFils - acc.creditBalanceBaseFils;
        totalExpensesFils += netExp;
        expenseRows.push({
          accountId: acc.accountId,
          accountCode: acc.code,
          labelEn: acc.nameEn,
          labelAr: acc.nameAr,
          amountFils: netExp,
          formattedAed: formatMoney(netExp, 'AED'),
          drillDownVouchers: vouchers
        });
      }
    }

    const netProfitLossFils = totalRevenueFils - totalExpensesFils;

    return {
      period,
      revenueRows,
      totalRevenueFils,
      expenseRows,
      totalExpensesFils,
      netProfitLossFils,
      formattedNetProfitLossAed: formatMoney(netProfitLossFils, 'AED')
    };
  }

  /**
   * Generates Balance Sheet and verifies the accounting equation: Assets = Liabilities + Equity.
   */
  static buildBalanceSheet(
    asOfDate: string,
    summaries: TrialBalanceAccountSummary[],
    periodNetIncomeFils: bigint = 0n,
    sourceVouchersMap?: Map<UUID, StatementRowDrillDownVoucher[]>
  ): BalanceSheetReport {
    let totalAssetsFils = 0n;
    const assetRows: FinancialStatementRow[] = [];

    let totalLiabilitiesFils = 0n;
    const liabilityRows: FinancialStatementRow[] = [];

    let totalEquityFils = 0n;
    const equityRows: FinancialStatementRow[] = [];

    for (const acc of summaries) {
      const vouchers = sourceVouchersMap?.get(acc.accountId) ?? [];

      if (acc.category === 'ASSET') {
        const netAsset = acc.debitBalanceBaseFils - acc.creditBalanceBaseFils;
        totalAssetsFils += netAsset;
        assetRows.push({
          accountId: acc.accountId,
          accountCode: acc.code,
          labelEn: acc.nameEn,
          labelAr: acc.nameAr,
          amountFils: netAsset,
          formattedAed: formatMoney(netAsset, 'AED'),
          drillDownVouchers: vouchers
        });
      } else if (acc.category === 'LIABILITY') {
        const netLiab = acc.creditBalanceBaseFils - acc.debitBalanceBaseFils;
        totalLiabilitiesFils += netLiab;
        liabilityRows.push({
          accountId: acc.accountId,
          accountCode: acc.code,
          labelEn: acc.nameEn,
          labelAr: acc.nameAr,
          amountFils: netLiab,
          formattedAed: formatMoney(netLiab, 'AED'),
          drillDownVouchers: vouchers
        });
      } else if (acc.category === 'EQUITY') {
        const netEq = acc.creditBalanceBaseFils - acc.debitBalanceBaseFils;
        totalEquityFils += netEq;
        equityRows.push({
          accountId: acc.accountId,
          accountCode: acc.code,
          labelEn: acc.nameEn,
          labelAr: acc.nameAr,
          amountFils: netEq,
          formattedAed: formatMoney(netEq, 'AED'),
          drillDownVouchers: vouchers
        });
      }
    }

    if (periodNetIncomeFils !== 0n) {
      totalEquityFils += periodNetIncomeFils;
      equityRows.push({
        labelEn: 'Current Year Retained Earnings (Net Profit)',
        labelAr: 'الأرباح المحتجزة للفترة الحالية',
        amountFils: periodNetIncomeFils,
        formattedAed: formatMoney(periodNetIncomeFils, 'AED')
      });
    }

    const isBalanced = totalAssetsFils === totalLiabilitiesFils + totalEquityFils;

    return {
      asOfDate,
      assetRows,
      totalAssetsFils,
      liabilityRows,
      totalLiabilitiesFils,
      equityRows,
      totalEquityFils,
      isBalanced
    };
  }

  /**
   * Generates Multi-Book Comparative Report (Statutory IFRS Book vs UAE Tax Book vs Management Book).
   * Highlights statutory Corporate Tax adjustments (e.g. 50% non-deductible entertainment per Article 32).
   */
  static buildMultiBookComparative(
    period: string,
    ifrsSummaries: TrialBalanceAccountSummary[],
    taxSummaries: TrialBalanceAccountSummary[],
    managementSummaries: TrialBalanceAccountSummary[]
  ): MultiBookComparativeReport {
    const rows: MultiBookComparativeRow[] = [];
    const taxMap = new Map(taxSummaries.map((s) => [s.code, s]));
    const mgmtMap = new Map(managementSummaries.map((s) => [s.code, s]));

    let totalIfrsProfit = 0n;
    let totalTaxableIncome = 0n;
    let totalManagementProfit = 0n;

    for (const ifrsAcc of ifrsSummaries) {
      const taxAcc = taxMap.get(ifrsAcc.code);
      const mgmtAcc = mgmtMap.get(ifrsAcc.code);

      const ifrsNet =
        ifrsAcc.category === 'REVENUE'
          ? ifrsAcc.creditBalanceBaseFils - ifrsAcc.debitBalanceBaseFils
          : ifrsAcc.debitBalanceBaseFils - ifrsAcc.creditBalanceBaseFils;

      const taxNet = taxAcc
        ? taxAcc.category === 'REVENUE'
          ? taxAcc.creditBalanceBaseFils - taxAcc.debitBalanceBaseFils
          : taxAcc.debitBalanceBaseFils - taxAcc.creditBalanceBaseFils
        : ifrsNet;

      const mgmtNet = mgmtAcc
        ? mgmtAcc.category === 'REVENUE'
          ? mgmtAcc.creditBalanceBaseFils - mgmtAcc.debitBalanceBaseFils
          : mgmtAcc.debitBalanceBaseFils - mgmtAcc.creditBalanceBaseFils
        : ifrsNet;

      const taxVariance = taxNet - ifrsNet;
      let taxAdjustmentRationale: string | undefined;

      if (ifrsAcc.code.includes('6050') || /Entertainment/i.test(ifrsAcc.nameEn)) {
        taxAdjustmentRationale =
          'Federal Decree-Law No. 47 of 2022, Article 32: 50% of entertainment expenditure is non-deductible.';
      }

      if (ifrsAcc.category === 'REVENUE') {
        totalIfrsProfit += ifrsNet;
        totalTaxableIncome += taxNet;
        totalManagementProfit += mgmtNet;
      } else if (ifrsAcc.category === 'EXPENSE') {
        totalIfrsProfit -= ifrsNet;
        totalTaxableIncome -= taxNet;
        totalManagementProfit -= mgmtNet;
      }

      rows.push({
        accountCode: ifrsAcc.code,
        accountName: ifrsAcc.nameEn,
        ifrsAmountFils: ifrsNet,
        taxBookAmountFils: taxNet,
        managementAmountFils: mgmtNet,
        taxVarianceFils: taxVariance,
        taxAdjustmentRationale
      });
    }

    const netTaxAdjustments = totalTaxableIncome - totalIfrsProfit;

    return {
      period,
      rows,
      totalIfrsProfitFils: totalIfrsProfit,
      totalTaxableIncomeFils: totalTaxableIncome,
      totalManagementProfitFils: totalManagementProfit,
      netTaxAdjustmentsFils: netTaxAdjustments
    };
  }
}
