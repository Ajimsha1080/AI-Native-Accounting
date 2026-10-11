import { roundHalfEven } from '@ledger-ae/shared-types';

export interface PartialExemptionInput {
  taxableSuppliesFils: bigint; // Standard rated + zero rated supplies (entitled to recovery)
  exemptSuppliesFils: bigint;  // Exempt financial/residential supplies (not entitled to recovery)
  residualInputVatFils: bigint; // Overhead/common input VAT to be apportioned
}

export interface PartialExemptionResult {
  recoveryRatioBps: bigint; // Basis points (e.g. 8000n = 80.00%)
  recoverableVatFils: bigint;
  blockedVatFils: bigint;
  verifyWithTaxAdvisor: boolean;
  legalCitation: string;
}

/**
 * Calculates UAE VAT Partial Exemption Input Tax Apportionment.
 * Reference: Executive Regulation of Federal Decree-Law No. 8 of 2017, Article 55 (Standard Method).
 * Apportionment Ratio = Taxable Supplies / (Taxable Supplies + Exempt Supplies)
 */
export function calculatePartialExemption(
  input: PartialExemptionInput
): PartialExemptionResult {
  const totalSupplies = input.taxableSuppliesFils + input.exemptSuppliesFils;

  if (totalSupplies === 0n) {
    return {
      recoveryRatioBps: 0n,
      recoverableVatFils: 0n,
      blockedVatFils: input.residualInputVatFils,
      verifyWithTaxAdvisor: true,
      legalCitation: 'Executive Regulation of Federal Decree-Law No. 8 of 2017, Article 55'
    };
  }

  // Multiply by 10,000 for basis points (100% = 10,000 bps)
  const ratioNumerator = input.taxableSuppliesFils * 10000n;
  const recoveryRatioBps = roundHalfEven(ratioNumerator, totalSupplies);

  // Recoverable VAT = Residual VAT * recoveryRatioBps / 10000
  const recoverableVatFils = roundHalfEven(
    input.residualInputVatFils * recoveryRatioBps,
    10000n
  );
  const blockedVatFils = input.residualInputVatFils - recoverableVatFils;

  return {
    recoveryRatioBps,
    recoverableVatFils,
    blockedVatFils,
    verifyWithTaxAdvisor: true, // Special apportionment methods or annual adjustments require advisor review
    legalCitation: 'Executive Regulation of Federal Decree-Law No. 8 of 2017, Article 55'
  };
}
