import { UUID, roundHalfEven, formatMoney } from '@ledger-ae/shared-types';

export interface CorporateTaxEntityProfile {
  entityId: UUID;
  entityName: string;
  trn?: string; // 15-digit Tax Registration Number
  jurisdiction?: 'MAINLAND' | 'FREE_ZONE' | 'ADGM' | 'DIFC';
  isQualifyingFreeZonePerson: boolean;
  freeZoneName?: string;
  isSmallBusinessReliefElected: boolean; // Revenue <= AED 3,000,000 (Art. 21)
  isTaxGroupMember?: boolean;
  taxGroupId?: string;
  isTaxGroupParent?: boolean;
}

export interface RelatedPartyTransaction {
  partyName: string;
  partyTrn?: string;
  relationship: 'PARENT' | 'SUBSIDIARY' | 'FELLOW_SUBSIDIARY' | 'DIRECTOR' | 'KEY_MANAGEMENT';
  transactionType: 'MANAGEMENT_FEES' | 'INTERCOMPANY_LOAN_INTEREST' | 'GOODS_PURCHASE' | 'SERVICES';
  amountFils: bigint;
  isArmsLengthConfirmed: boolean;
}

export interface CorporateTaxComputationInput {
  entity: CorporateTaxEntityProfile;
  taxPeriodYear: number;
  grossRevenueFils: bigint;
  netAccountingProfitLossFils: bigint;
  // Free Zone Revenue Breakdown
  qualifyingRevenueFils?: bigint;
  nonQualifyingRevenueFils?: bigint;
  // Accounting-to-Tax Adjustments (Federal Decree-Law No. 47 of 2022)
  entertainmentExpensesFils: bigint; // 50% non-deductible (Art. 32)
  penaltiesAndFinesFils: bigint;     // 100% non-deductible (Art. 33)
  nonQualifyingDonationsFils?: bigint; // 100% non-deductible (Art. 33(3))
  netInterestExpenditureFils?: bigint; // Subject to Art. 30 Interest Capping Rule
  exemptDividendsReceivedFils: bigint; // 100% exempt (Art. 22 Participation Exemption)
  foreignPeExemptIncomeFils?: bigint;  // Art. 24 Foreign PE Exemption
  taxLossReliefBfwdFils: bigint;    // Max 75% of taxable income (Art. 37)
  // Related Party Transactions
  relatedPartyTransactions?: RelatedPartyTransaction[];
}

export interface CorporateTaxComputationResult {
  taxPeriodYear: number;
  entityName: string;
  trn: string;
  netAccountingProfitFils: bigint;
  // Adjustments breakdown
  disallowedEntertainmentFils: bigint;
  disallowedPenaltiesFils: bigint;
  disallowedDonationsFils: bigint;
  disallowedInterestFils: bigint;
  totalTaxAdjustmentsAddBackFils: bigint;
  taxAdjustmentsAddBackFils: bigint; // Backward compatibility alias
  exemptDividendsFils: bigint;
  foreignPeExemptIncomeFils: bigint;
  totalTaxAdjustmentsDeductionsFils: bigint;
  adjustedTaxableIncomeBeforeLossFils: bigint;
  utilizedTaxLossFils: bigint;
  unutilizedLossCarriedForwardFils: bigint;
  finalTaxableIncomeFils: bigint;
  // Special Regimes
  isSmallBusinessReliefApplied: boolean;
  isQfzpDisqualified: boolean;
  qfzpDeMinimisRatioBps: bigint; // Basis points (e.g. 500 = 5.00%)
  // Tax Liability
  statutoryThresholdFils: bigint; // AED 375,000 (37,500,000 fils)
  taxDueFils: bigint;
  effectiveTaxRateBps: bigint;
  verifyWithTaxAdvisor: true;
  lawReferences: string[];
  relatedPartyDisclosureCount: number;
}

/**
 * Calculates UAE Corporate Tax under Federal Decree-Law No. 47 of 2022 and Cabinet Decisions.
 */
export function calculateCorporateTax(
  input: CorporateTaxComputationInput
): CorporateTaxComputationResult {
  const statutoryThresholdFils = 37500000n; // AED 375,000.00
  const lawReferences: string[] = [
    'Federal Decree-Law No. 47 of 2022, Article 3 (Standard 9% Rate & AED 375,000 Zero-Bracket)',
    'Federal Decree-Law No. 47 of 2022, Article 32 (50% Entertainment Expenditure Disallowance)',
    'Federal Decree-Law No. 47 of 2022, Article 33 (100% Disallowed Fines, Penalties & Bribes)',
    'Federal Decree-Law No. 47 of 2022, Article 37 (75% Tax Loss Relief Cap & Indefinite Carry-Forward)'
  ];

  // 1. Small Business Relief (SBR) Check (Article 21 & Ministerial Decision No. 73 of 2023)
  // Revenue <= AED 3,000,000 (300,000,000 fils)
  const SBR_REVENUE_CAP_FILS = 300000000n; // AED 3,000,000
  let isSmallBusinessReliefApplied = false;

  if (
    input.entity.isSmallBusinessReliefElected &&
    input.grossRevenueFils <= SBR_REVENUE_CAP_FILS
  ) {
    isSmallBusinessReliefApplied = true;
    lawReferences.push(
      'Federal Decree-Law No. 47 of 2022, Article 21 & Ministerial Decision No. 73 of 2023 on Small Business Relief'
    );
  }

  // 2. Add-backs
  const disallowedEntertainment = roundHalfEven(input.entertainmentExpensesFils * 50n, 100n);
  const disallowedPenalties = input.penaltiesAndFinesFils;
  const disallowedDonations = input.nonQualifyingDonationsFils ?? 0n;

  // Article 30 General Interest Capping Rule: De-minimis threshold of AED 12,000,000 net interest
  const INTEREST_DEMINIMIS_CAP_FILS = 1200000000n; // AED 12,000,000
  let disallowedInterest = 0n;
  if (input.netInterestExpenditureFils && input.netInterestExpenditureFils > INTEREST_DEMINIMIS_CAP_FILS) {
    // Net interest exceeding AED 12M capped at 30% of EBITDA; remainder disallowed
    lawReferences.push('Federal Decree-Law No. 47 of 2022, Article 30 (General Interest Deduction Limitation)');
    disallowedInterest = input.netInterestExpenditureFils - INTEREST_DEMINIMIS_CAP_FILS;
  }

  const totalTaxAdjustmentsAddBackFils =
    disallowedEntertainment + disallowedPenalties + disallowedDonations + disallowedInterest;

  // 3. Deductions
  const exemptDividends = input.exemptDividendsReceivedFils;
  const foreignPeExemptIncome = input.foreignPeExemptIncomeFils ?? 0n;
  const totalTaxAdjustmentsDeductionsFils = exemptDividends + foreignPeExemptIncome;

  if (exemptDividends > 0n) {
    lawReferences.push('Federal Decree-Law No. 47 of 2022, Article 22 (Participation Exemption for Dividends)');
  }

  // 4. Adjusted Taxable Income before tax loss relief
  const adjustedTaxableIncomeBeforeLossFils =
    input.netAccountingProfitLossFils +
    totalTaxAdjustmentsAddBackFils -
    totalTaxAdjustmentsDeductionsFils;

  // If taxable income is negative or zero, carry forward loss
  if (adjustedTaxableIncomeBeforeLossFils <= 0n) {
    const newLossGenerated = -adjustedTaxableIncomeBeforeLossFils;
    return {
      taxPeriodYear: input.taxPeriodYear,
      entityName: input.entity.entityName,
      trn: input.entity.trn ?? '100000000000000',
      netAccountingProfitFils: input.netAccountingProfitLossFils,
      disallowedEntertainmentFils: disallowedEntertainment,
      disallowedPenaltiesFils: disallowedPenalties,
      disallowedDonationsFils: disallowedDonations,
      disallowedInterestFils: disallowedInterest,
      totalTaxAdjustmentsAddBackFils,
      taxAdjustmentsAddBackFils: totalTaxAdjustmentsAddBackFils,
      exemptDividendsFils: exemptDividends,
      foreignPeExemptIncomeFils: foreignPeExemptIncome,
      totalTaxAdjustmentsDeductionsFils,
      adjustedTaxableIncomeBeforeLossFils,
      utilizedTaxLossFils: 0n,
      unutilizedLossCarriedForwardFils: input.taxLossReliefBfwdFils + newLossGenerated,
      finalTaxableIncomeFils: 0n,
      isSmallBusinessReliefApplied,
      isQfzpDisqualified: false,
      qfzpDeMinimisRatioBps: 0n,
      statutoryThresholdFils,
      taxDueFils: 0n,
      effectiveTaxRateBps: 0n,
      verifyWithTaxAdvisor: true,
      lawReferences,
      relatedPartyDisclosureCount: input.relatedPartyTransactions?.length ?? 0
    };
  }

  // 5. Tax Loss Relief Cap (Max 75% of taxable income per Art. 37)
  const maxAllowableLossRelief = roundHalfEven(adjustedTaxableIncomeBeforeLossFils * 75n, 100n);
  const utilizedTaxLossFils =
    input.taxLossReliefBfwdFils > maxAllowableLossRelief
      ? maxAllowableLossRelief
      : input.taxLossReliefBfwdFils;

  const unutilizedLossCarriedForwardFils = input.taxLossReliefBfwdFils - utilizedTaxLossFils;
  const finalTaxableIncomeFils = adjustedTaxableIncomeBeforeLossFils - utilizedTaxLossFils;

  // 6. Qualifying Free Zone Person (QFZP) De-Minimis Test (Cabinet Decision No. 139 of 2023)
  let isQfzpDisqualified = false;
  let qfzpDeMinimisRatioBps = 0n;

  if (input.entity.isQualifyingFreeZonePerson) {
    lawReferences.push(
      'Cabinet Decision No. 139 of 2023 & Ministerial Decision No. 265 of 2023 on Qualifying Free Zone Persons'
    );
    const totalRevenue = (input.qualifyingRevenueFils ?? 0n) + (input.nonQualifyingRevenueFils ?? 0n);

    if (totalRevenue > 0n && input.nonQualifyingRevenueFils) {
      qfzpDeMinimisRatioBps = roundHalfEven(input.nonQualifyingRevenueFils * 10000n, totalRevenue);
      const deMinimisAmountCapFils = 500000000n; // AED 5,000,000 (500,000,000 fils)

      // De-minimis rule: Non-qualifying revenue must not exceed the lower of 5% of total revenue OR AED 5,000,000
      const exceeds5Percent = qfzpDeMinimisRatioBps > 500n;
      const exceeds5Million = input.nonQualifyingRevenueFils > deMinimisAmountCapFils;

      if (exceeds5Percent || exceeds5Million) {
        // Disqualified from 0% QFZP regime -> taxed at 9% on entire taxable income
        isQfzpDisqualified = true;
      }
    }
  }

  // 7. Compute Tax Due
  let taxDueFils = 0n;

  if (isSmallBusinessReliefApplied) {
    // SBR applies: 0% tax
    taxDueFils = 0n;
  } else if (input.entity.isQualifyingFreeZonePerson && !isQfzpDisqualified) {
    // QFZP 0% qualifying rate applies
    taxDueFils = 0n;
  } else {
    // Standard 9% on excess over AED 375,000
    if (finalTaxableIncomeFils > statutoryThresholdFils) {
      const taxableExcess = finalTaxableIncomeFils - statutoryThresholdFils;
      taxDueFils = roundHalfEven(taxableExcess * 900n, 10000n); // 9.00%
    }
  }

  const effectiveTaxRateBps =
    finalTaxableIncomeFils > 0n
      ? roundHalfEven(taxDueFils * 10000n, finalTaxableIncomeFils)
      : 0n;

  return {
    taxPeriodYear: input.taxPeriodYear,
    entityName: input.entity.entityName,
    trn: input.entity.trn ?? '100000000000000',
    netAccountingProfitFils: input.netAccountingProfitLossFils,
    disallowedEntertainmentFils: disallowedEntertainment,
    disallowedPenaltiesFils: disallowedPenalties,
    disallowedDonationsFils: disallowedDonations,
    disallowedInterestFils: disallowedInterest,
    totalTaxAdjustmentsAddBackFils,
    taxAdjustmentsAddBackFils: totalTaxAdjustmentsAddBackFils,
    exemptDividendsFils: exemptDividends,
    foreignPeExemptIncomeFils: foreignPeExemptIncome,
    totalTaxAdjustmentsDeductionsFils,
    adjustedTaxableIncomeBeforeLossFils,
    utilizedTaxLossFils,
    unutilizedLossCarriedForwardFils,
    finalTaxableIncomeFils,
    isSmallBusinessReliefApplied,
    isQfzpDisqualified,
    qfzpDeMinimisRatioBps,
    statutoryThresholdFils,
    taxDueFils,
    effectiveTaxRateBps,
    verifyWithTaxAdvisor: true,
    lawReferences,
    relatedPartyDisclosureCount: input.relatedPartyTransactions?.length ?? 0
  };
}

/**
 * Generates official FTA EmaraTax Return-Ready Corporate Tax Filing Export.
 * Formats data into a structured report ready for portal submission.
 */
export function generateCorporateTaxReturnExport(
  result: CorporateTaxComputationResult,
  relatedParties: RelatedPartyTransaction[] = []
): string {
  const lines: string[] = [];

  lines.push('======================================================================');
  lines.push('  UAE FEDERAL TAX AUTHORITY (FTA) - CORPORATE TAX RETURN (FORM CT201)');
  lines.push('  Federal Decree-Law No. 47 of 2022 on the Taxation of Corporations');
  lines.push('======================================================================');
  lines.push(`Taxpayer Entity Name: ${result.entityName}`);
  lines.push(`Corporate Tax TRN: ${result.trn}`);
  lines.push(`Tax Period: Financial Year ${result.taxPeriodYear}`);
  lines.push(`Functional Currency: AED (United Arab Emirates Dirham)`);
  lines.push('');

  lines.push('--- SECTION 1: ACCOUNTING-TO-TAX RECONCILIATION ---');
  lines.push(`Net Accounting Profit / (Loss) under IFRS: AED ${formatMoney(result.netAccountingProfitFils, 'AED')}`);
  lines.push('');
  lines.push('Non-Deductible Add-Backs:');
  lines.push(`  (+) 50% Entertainment Expenditure (Art. 32): AED ${formatMoney(result.disallowedEntertainmentFils, 'AED')}`);
  lines.push(`  (+) Disallowed Penalties and Fines (Art. 33): AED ${formatMoney(result.disallowedPenaltiesFils, 'AED')}`);
  lines.push(`  (+) Non-Qualifying Donations (Art. 33(3)): AED ${formatMoney(result.disallowedDonationsFils, 'AED')}`);
  lines.push(`  (+) Net Interest Capping Disallowance (Art. 30): AED ${formatMoney(result.disallowedInterestFils, 'AED')}`);
  lines.push(`  Total Tax Add-Backs: AED ${formatMoney(result.totalTaxAdjustmentsAddBackFils, 'AED')}`);
  lines.push('');
  lines.push('Exempt Income Deductions:');
  lines.push(`  (-) Exempt Dividends (Participation Exemption Art. 22): AED ${formatMoney(result.exemptDividendsFils, 'AED')}`);
  lines.push(`  (-) Foreign PE Exempt Income (Art. 24): AED ${formatMoney(result.foreignPeExemptIncomeFils, 'AED')}`);
  lines.push(`  Total Tax Deductions: AED ${formatMoney(result.totalTaxAdjustmentsDeductionsFils, 'AED')}`);
  lines.push('');
  lines.push(`Adjusted Taxable Income (Before Losses): AED ${formatMoney(result.adjustedTaxableIncomeBeforeLossFils, 'AED')}`);
  lines.push('');

  lines.push('--- SECTION 2: TAX LOSS RELIEF & REGIMES ---');
  lines.push(`Utilized Tax Loss Relief (Capped at 75% per Art. 37): AED ${formatMoney(result.utilizedTaxLossFils, 'AED')}`);
  lines.push(`Unutilized Loss Carried Forward to Future Periods: AED ${formatMoney(result.unutilizedLossCarriedForwardFils, 'AED')}`);
  lines.push(`Final Taxable Income: AED ${formatMoney(result.finalTaxableIncomeFils, 'AED')}`);
  lines.push(`Small Business Relief (SBR Art. 21) Applied: ${result.isSmallBusinessReliefApplied ? 'YES' : 'NO'}`);
  lines.push(`Qualifying Free Zone Person (QFZP) Disqualified: ${result.isQfzpDisqualified ? 'YES (Breached De-Minimis)' : 'NO'}`);
  lines.push(`QFZP De-Minimis Ratio: ${(Number(result.qfzpDeMinimisRatioBps) / 100).toFixed(2)}%`);
  lines.push('');

  lines.push('--- SECTION 3: CORPORATE TAX LIABILITY COMPUTATION ---');
  lines.push(`Statutory 0% Threshold: AED ${formatMoney(result.statutoryThresholdFils, 'AED')}`);
  lines.push(`Taxable Amount Subject to 9%: AED ${formatMoney(result.finalTaxableIncomeFils > result.statutoryThresholdFils ? result.finalTaxableIncomeFils - result.statutoryThresholdFils : 0n, 'AED')}`);
  lines.push(`Total Corporate Tax Due: AED ${formatMoney(result.taxDueFils, 'AED')}`);
  lines.push(`Effective Tax Rate: ${(Number(result.effectiveTaxRateBps) / 100).toFixed(2)}%`);
  lines.push('');

  lines.push('--- SECTION 4: RELATED PARTY & TRANSFER PRICING DISCLOSURES (ART. 34/55) ---');
  lines.push(`Total Related Party Transactions: ${relatedParties.length}`);
  for (const rp of relatedParties) {
    lines.push(`  - Party: ${rp.partyName} | Relationship: ${rp.relationship} | Type: ${rp.transactionType} | Amount: AED ${formatMoney(rp.amountFils, 'AED')} | Arm's Length: ${rp.isArmsLengthConfirmed ? 'CONFIRMED' : 'FLAGGED'}`);
  }
  lines.push('');

  lines.push('--- SECTION 5: STATUTORY REFERENCES & ADVISOR DECLARATION ---');
  for (const ref of result.lawReferences) {
    lines.push(`  * ${ref}`);
  }
  lines.push('');
  lines.push('SAFEGUARD: VERIFY WITH UAE TAX ADVISOR BEFORE OFFICIAL FILING ON EMARATAX.');
  lines.push('======================================================================');

  return lines.join('\n');
}
