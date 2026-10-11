import { UUID } from '@ledger-ae/shared-types';

export enum AnomalyType {
  DUPLICATE_BILL = 'DUPLICATE_BILL',
  MISSING_TRN_ON_TAX_INVOICE = 'MISSING_TRN_ON_TAX_INVOICE',
  INCORRECT_VAT_CODE = 'INCORRECT_VAT_CODE',
  ABNORMAL_FX_RATE = 'ABNORMAL_FX_RATE',
  MISSING_ACCRUAL = 'MISSING_ACCRUAL',
  FLUX_EXPLANATION = 'FLUX_EXPLANATION'
}

export enum AnomalySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface AnomalyFinding {
  id: string;
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  documentOrVoucherId: string;
  accountCode?: string;
  descriptionEn: string;
  descriptionAr: string;
  actionableRecommendation: string;
  confidenceScore: number; // 0.0 - 1.0
  assignedRole?: string;
  isResolved: boolean;
}

export interface CandidateBill {
  id: string;
  vendorName: string;
  vendorTrn?: string;
  billNumber: string;
  amountFils: bigint;
  billDate: string;
  vatCode?: string;
  lineDescription?: string;
}

export interface AccountBalanceComparison {
  accountCode: string;
  accountName: string;
  priorPeriodFils: bigint;
  currentPeriodFils: bigint;
}

export class ContinuousAiMonitor {
  /**
   * Scans a candidate bill against existing bills to detect:
   * 1. Duplicate bills (same vendor, bill number, or identical amount & date).
   * 2. Missing TRN on tax-bearing bills.
   * 3. Incorrect VAT code (e.g. claiming input VAT on client entertainment).
   */
  static scanBill(bill: CandidateBill, existingBills: CandidateBill[]): AnomalyFinding[] {
    const findings: AnomalyFinding[] = [];

    // Check 1: Duplicate bill detection
    for (const existing of existingBills) {
      if (existing.id === bill.id) continue;

      // Exact vendor + bill number duplicate
      if (
        existing.vendorName.toLowerCase() === bill.vendorName.toLowerCase() &&
        existing.billNumber.toLowerCase() === bill.billNumber.toLowerCase()
      ) {
        findings.push({
          id: `anomaly-dup-${bill.id}`,
          anomalyType: AnomalyType.DUPLICATE_BILL,
          severity: AnomalySeverity.CRITICAL,
          documentOrVoucherId: bill.id,
          descriptionEn: `Potential duplicate bill: Vendor "${bill.vendorName}" already has Bill #${bill.billNumber} posted.`,
          descriptionAr: `احتمال وجود فاتورة مكررة: المورد "${bill.vendorName}" لديه بالفعل الفاتورة رقم ${bill.billNumber}.`,
          actionableRecommendation: 'Reject or merge with existing posted bill to prevent duplicate payment.',
          confidenceScore: 0.99,
          assignedRole: 'AP_CLERK',
          isResolved: false
        });
        break;
      }

      // Suspicious identical amount and date with same vendor
      if (
        existing.vendorName.toLowerCase() === bill.vendorName.toLowerCase() &&
        existing.amountFils === bill.amountFils &&
        existing.billDate === bill.billDate
      ) {
        findings.push({
          id: `anomaly-dup-amt-${bill.id}`,
          anomalyType: AnomalyType.DUPLICATE_BILL,
          severity: AnomalySeverity.HIGH,
          documentOrVoucherId: bill.id,
          descriptionEn: `Suspicious duplicate amount (${bill.amountFils} fils) on the same date for vendor "${bill.vendorName}".`,
          descriptionAr: `مبلغ مشبوه ومطابق لنفس التاريخ والمورد.`,
          actionableRecommendation: 'Verify whether two separate orders were placed or if this is an accidental double-billing.',
          confidenceScore: 0.85,
          assignedRole: 'AP_SUPERVISOR',
          isResolved: false
        });
        break;
      }
    }

    // Check 2: Missing TRN when VAT is claimed
    if (bill.vatCode === 'SR_5' && !bill.vendorTrn) {
      findings.push({
        id: `anomaly-trn-${bill.id}`,
        anomalyType: AnomalyType.MISSING_TRN_ON_TAX_INVOICE,
        severity: AnomalySeverity.HIGH,
        documentOrVoucherId: bill.id,
        descriptionEn: 'Standard 5% VAT claimed but vendor TRN is missing. FTA requires a valid 15-digit TRN to claim input tax deduction.',
        descriptionAr: 'تمت المطالبة بضريبة 5% ولكن الرقم الضريبي للمورد مفقود.',
        actionableRecommendation: 'Request a compliant tax invoice with 15-digit TRN from vendor before claiming Box 10 input tax.',
        confidenceScore: 0.95,
        assignedRole: 'TAX_AGENT',
        isResolved: false
      });
    }

    // Check 3: Incorrect VAT Code on Blocked Input Expenses (Article 53 Client Entertainment)
    if (
      bill.lineDescription &&
      /Client\s*Entertainment|VIP\s*Hospitality|Client\s*Dinner/i.test(bill.lineDescription) &&
      bill.vatCode === 'INPUT_SR_5'
    ) {
      findings.push({
        id: `anomaly-vat-block-${bill.id}`,
        anomalyType: AnomalyType.INCORRECT_VAT_CODE,
        severity: AnomalySeverity.HIGH,
        documentOrVoucherId: bill.id,
        descriptionEn: 'Article 53 Non-Recoverable Expense Warning: Input tax on non-employee entertainment cannot be recovered under UAE Executive Regulations.',
        descriptionAr: 'تحذير المادة 53: لا يمكن استرداد ضريبة المدخلات على نفقات الترفيه لغير الموظفين.',
        actionableRecommendation: 'Reclassify tax code from INPUT_SR_5 to INPUT_BLOCKED_5.',
        confidenceScore: 0.96,
        assignedRole: 'TAX_AGENT',
        isResolved: false
      });
    }

    return findings;
  }

  /**
   * Scans FX conversions against Central Bank pegged / reasonable corridors.
   * e.g. USD/AED peg is 3.6725. Any rate outside 3.65 - 3.70 indicates an outlier.
   */
  static checkFxOutlier(
    currency: string,
    fxRateScaled: bigint,
    rateScale: bigint = 100000000n
  ): AnomalyFinding | null {
    if (currency === 'USD') {
      const minAcceptable = 365000000n; // 3.65
      const maxAcceptable = 370000000n; // 3.70

      if (fxRateScaled < minAcceptable || fxRateScaled > maxAcceptable) {
        return {
          id: `anomaly-fx-usd-${Date.now()}`,
          anomalyType: AnomalyType.ABNORMAL_FX_RATE,
          severity: AnomalySeverity.CRITICAL,
          documentOrVoucherId: 'FX_CONVERSION',
          descriptionEn: `USD/AED rate deviates from official UAE Central Bank peg (3.6725). Rate recorded: ${(Number(fxRateScaled) / Number(rateScale)).toFixed(4)}.`,
          descriptionAr: `انحراف في سعر صرف الدولار مقابل الدرهم عن السعر الثابت للبنك المركزي.`,
          actionableRecommendation: 'Review exchange rate entry. Standard pegged rate should be 3.6725.',
          confidenceScore: 0.98,
          assignedRole: 'FINANCIAL_CONTROLLER',
          isResolved: false
        };
      }
    }
    return null;
  }

  /**
   * Scans recurring expenses to detect missing month-end accruals.
   * Compares prior period recurring vendors against current period postings.
   */
  static detectMissingAccruals(
    priorPeriodVendors: string[],
    currentPeriodVendors: string[],
    periodName: string
  ): AnomalyFinding[] {
    const findings: AnomalyFinding[] = [];
    const currentSet = new Set(currentPeriodVendors.map((v) => v.toLowerCase().trim()));

    for (const vendor of priorPeriodVendors) {
      if (!currentSet.has(vendor.toLowerCase().trim())) {
        findings.push({
          id: `anomaly-accrual-${vendor.replace(/\s+/g, '-').toLowerCase()}`,
          anomalyType: AnomalyType.MISSING_ACCRUAL,
          severity: AnomalySeverity.MEDIUM,
          documentOrVoucherId: `PERIOD-${periodName}`,
          descriptionEn: `Missing Month-End Accrual: Recurring vendor "${vendor}" has no expense or accrual posted in ${periodName}.`,
          descriptionAr: `استحقاق مفقود لنهاية الشهر: المورد المتكرر "${vendor}" ليس له قيد مصروف أو استحقاق مسجل في ${periodName}.`,
          actionableRecommendation: `Create month-end accrual journal proposal for ${vendor}.`,
          confidenceScore: 0.9,
          assignedRole: 'SENIOR_ACCOUNTANT',
          isResolved: false
        });
      }
    }

    return findings;
  }

  /**
   * Conducts Financial Statement Flux Analysis (Variance Analysis).
   * Flags accounts with absolute change > AED 10,000 (1,000,000 fils) AND relative change > 20%.
   */
  static analyzeFluxVariances(
    comparisons: AccountBalanceComparison[]
  ): AnomalyFinding[] {
    const findings: AnomalyFinding[] = [];
    const SIGNIFICANT_AMOUNT_FILS = 1000000n; // AED 10,000

    for (const comp of comparisons) {
      const diffFils = comp.currentPeriodFils - comp.priorPeriodFils;
      const absDiffFils = diffFils < 0n ? -diffFils : diffFils;

      if (absDiffFils >= SIGNIFICANT_AMOUNT_FILS) {
        let percentChange = 0;
        if (comp.priorPeriodFils !== 0n) {
          const absPrior = comp.priorPeriodFils < 0n ? -comp.priorPeriodFils : comp.priorPeriodFils;
          percentChange = Number((absDiffFils * 100n) / absPrior);
        } else {
          percentChange = 100; // New balance from zero
        }

        if (percentChange >= 20) {
          findings.push({
            id: `anomaly-flux-${comp.accountCode}`,
            anomalyType: AnomalyType.FLUX_EXPLANATION,
            severity: percentChange >= 50 ? AnomalySeverity.HIGH : AnomalySeverity.MEDIUM,
            documentOrVoucherId: `ACCT-${comp.accountCode}`,
            accountCode: comp.accountCode,
            descriptionEn: `Significant flux detected on Account ${comp.accountCode} (${comp.accountName}): Variance of ${percentChange}% (${diffFils > 0n ? '+' : ''}${Number(diffFils) / 100} AED).`,
            descriptionAr: `تم اكتشاف تباين مالي كبير في الحساب ${comp.accountCode} (${comp.accountName}): نسبة التغير ${percentChange}%.`,
            actionableRecommendation: 'Generate AI flux explanation proposal and require Controller sign-off before closing.',
            confidenceScore: 0.95,
            assignedRole: 'CONTROLLER',
            isResolved: false
          });
        }
      }
    }

    return findings;
  }
}
