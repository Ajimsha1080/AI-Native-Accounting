import { roundHalfEven } from '@ledger-ae/shared-types';

export enum ExciseCategory {
  CARBONATED_DRINKS = 'CARBONATED_DRINKS',       // 50%
  ENERGY_DRINKS = 'ENERGY_DRINKS',               // 100%
  TOBACCO_PRODUCTS = 'TOBACCO_PRODUCTS',         // 100%
  ELECTRONIC_SMOKING = 'ELECTRONIC_SMOKING',     // 100%
  SWEETENED_DRINKS = 'SWEETENED_DRINKS'          // 50%
}

export const EXCISE_RATES_BPS: Record<ExciseCategory, bigint> = {
  [ExciseCategory.CARBONATED_DRINKS]: 5000n, // 50%
  [ExciseCategory.ENERGY_DRINKS]: 10000n,   // 100%
  [ExciseCategory.TOBACCO_PRODUCTS]: 10000n, // 100%
  [ExciseCategory.ELECTRONIC_SMOKING]: 10000n, // 100%
  [ExciseCategory.SWEETENED_DRINKS]: 5000n   // 50%
};

export interface ExciseTaxCalculationInput {
  category: ExciseCategory;
  designatedRetailPriceFils: bigint; // Standard retail price per unit
  quantity: bigint;
}

export interface ExciseTaxResult {
  category: ExciseCategory;
  exciseRatePercent: number;
  totalTaxableValueFils: bigint;
  exciseTaxDueFils: bigint;
  lawReference: string;
}

/**
 * Calculates UAE Excise Tax under Federal Decree-Law No. 7 of 2017 on Excise Tax.
 */
export function calculateExciseTax(input: ExciseTaxCalculationInput): ExciseTaxResult {
  const rateBps = EXCISE_RATES_BPS[input.category];
  const totalTaxableValueFils = input.designatedRetailPriceFils * input.quantity;

  const exciseTaxDueFils = roundHalfEven(totalTaxableValueFils * rateBps, 10000n);

  return {
    category: input.category,
    exciseRatePercent: Number(rateBps) / 100,
    totalTaxableValueFils,
    exciseTaxDueFils,
    lawReference: 'Federal Decree-Law No. 7 of 2017 & Cabinet Decision No. 52 of 2019'
  };
}
