import { roundHalfEven } from '@ledger-ae/shared-types';

export interface EosgCalculationInput {
  basicMonthlySalaryFils: bigint; // Calculation is based strictly on basic wage, excluding allowances
  employmentStartDate: string;   // 'YYYY-MM-DD'
  employmentEndDate: string;     // 'YYYY-MM-DD'
  terminationType: 'EMPLOYER_TERMINATION' | 'RESIGNATION';
}

export interface EosgCalculationResult {
  totalServiceYears: number;
  completedYears: number;
  remainderDays: number;
  dailyWageFils: bigint;
  gratuityDueFils: bigint;
  maxGratuityCapFils: bigint; // Capped at two years basic salary per Art. 51
  legalCitation: string;
}

/**
 * Calculates End of Service Gratuity (EOSG) under UAE Labour Law
 * (Federal Decree-Law No. 33 of 2021, Article 51).
 *
 * Rules:
 * 1. Less than 1 year of continuous service: 0 gratuity.
 * 2. 1 to 5 years: 21 days' basic wage for each year of service.
 * 3. More than 5 years: 30 days' basic wage for each year exceeding 5 years.
 * 4. Maximum cap: Total gratuity cannot exceed 2 years' basic salary.
 * 5. Under Federal Decree-Law No. 33 of 2021, limited contract rules apply equally regardless of resignation/termination after 1 year.
 */
export function calculateUaeEosg(input: EosgCalculationInput): EosgCalculationResult {
  const start = new Date(input.employmentStartDate);
  const end = new Date(input.employmentEndDate);

  const diffTime = end.getTime() - start.getTime();
  const totalDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
  const totalServiceYears = totalDays / 365.25;

  const basicWage = input.basicMonthlySalaryFils;
  // Daily basic wage = Monthly basic / 30 days
  const dailyWageFils = roundHalfEven(basicWage, 30n);
  const twoYearsCapFils = basicWage * 24n; // 2 years = 24 months

  // Service < 1 year: No gratuity entitlement
  if (totalDays < 365) {
    return {
      totalServiceYears,
      completedYears: 0,
      remainderDays: totalDays,
      dailyWageFils,
      gratuityDueFils: 0n,
      maxGratuityCapFils: twoYearsCapFils,
      legalCitation: 'Federal Decree-Law No. 33 of 2021, Article 51(2)'
    };
  }

  const completedYears = Math.floor(totalDays / 365);
  const remainderDays = totalDays % 365;

  let totalGratuityDays = 0n;

  // First 5 years: 21 days per year
  const firstTierYears = Math.min(completedYears, 5);
  totalGratuityDays += BigInt(firstTierYears) * 21n;

  // Subsequent years beyond 5 years: 30 days per year
  if (completedYears > 5) {
    const secondTierYears = completedYears - 5;
    totalGratuityDays += BigInt(secondTierYears) * 30n;
  }

  // Pro-rata for remainder days
  const proRataDailyRate = completedYears >= 5 ? 30n : 21n;
  const proRataDays = roundHalfEven(BigInt(remainderDays) * proRataDailyRate, 365n);
  totalGratuityDays += proRataDays;

  let gratuityDueFils = totalGratuityDays * dailyWageFils;

  // Enforce statutory cap: Not to exceed 2 years' basic wage
  if (gratuityDueFils > twoYearsCapFils) {
    gratuityDueFils = twoYearsCapFils;
  }

  return {
    totalServiceYears: Math.round(totalServiceYears * 100) / 100,
    completedYears,
    remainderDays,
    dailyWageFils,
    gratuityDueFils,
    maxGratuityCapFils: twoYearsCapFils,
    legalCitation: 'Federal Decree-Law No. 33 of 2021, Article 51'
  };
}
