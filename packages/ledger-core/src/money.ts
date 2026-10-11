import { MoneyAmount } from '@ledger-ae/shared-types';

/**
 * Currency scale definitions (ISO-4217 standard).
 */
export const CURRENCY_DECIMALS: Record<string, number> = {
  AED: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  SAR: 2,
  QAR: 2,
  INR: 2,
  JPY: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3
};

/**
 * Deterministic Banker's Rounding (Half-Even Rounding).
 * Eliminates cumulative statistical upward bias in large financial ledgers.
 */
export function roundHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new Error('Division by zero in rounding');
  }

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const absRemainder = remainder < 0n ? -remainder : remainder;
  const absDenominator = denominator < 0n ? -denominator : denominator;

  const doubleRemainder = absRemainder * 2n;

  if (doubleRemainder < absDenominator) {
    return quotient;
  } else if (doubleRemainder > absDenominator) {
    return remainder > 0n ? quotient + 1n : quotient - 1n;
  } else {
    // Exact half-way case: round to nearest even integer
    const isEven = quotient % 2n === 0n;
    if (isEven) {
      return quotient;
    } else {
      return remainder > 0n ? quotient + 1n : quotient - 1n;
    }
  }
}

/**
 * High-precision FX multiplication.
 * rateScale is typically 10^8 (e.g. 100,000,000n for 8 decimals of rate).
 */
export function convertCurrency(
  amountTxn: bigint,
  rate: bigint,
  rateScale: bigint = 100000000n
): bigint {
  const product = amountTxn * rate;
  return roundHalfEven(product, rateScale);
}

/**
 * Helper to construct strongly typed MoneyAmount.
 */
export function makeMoney(amount: bigint, currency: string): MoneyAmount {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  return {
    amount,
    currency,
    decimals
  };
}

/**
 * Format minor units into standard display strings (e.g. 10050n fils -> '100.50').
 */
export function formatMoney(amount: bigint, currency: string): string {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  const isNegative = amount < 0n;
  const absAmount = isNegative ? -amount : amount;

  if (decimals === 0) {
    return `${isNegative ? '-' : ''}${absAmount.toString()}`;
  }

  const divisor = 10n ** BigInt(decimals);
  const whole = absAmount / divisor;
  const fraction = absAmount % divisor;
  const fractionPadded = fraction.toString().padStart(decimals, '0');

  return `${isNegative ? '-' : ''}${whole.toString()}.${fractionPadded}`;
}
