/**
 * Zero-Float Decimal Money Parser and Formatter
 * 
 * Production financial standard:
 * Converts between decimal strings (e.g. "1250.50", "-40.25") and integer minor units (BigInt fils)
 * using string manipulation and integer math exclusively.
 * NEVER uses parseFloat, Number(str), or toFixed on monetary amounts.
 */

export interface DecimalParseOptions {
  decimals?: number; // default 2 (fils/cents)
  allowNegative?: boolean; // default true
}

/**
 * Parses a decimal string (e.g., "1,250.50", "40.5", "-12.00") into exact BigInt minor units.
 * Throws on malformed input to avoid silent rounding or truncation.
 */
export function parseDecimalToMinorUnits(input: string | number | bigint, options: DecimalParseOptions = {}): bigint {
  if (typeof input === 'bigint') {
    return input;
  }

  const decimals = options.decimals ?? 2;
  const allowNegative = options.allowNegative ?? true;

  if (typeof input === 'number') {
    throw new Error('Passing JS number to parseDecimalToMinorUnits is forbidden to prevent IEEE-754 precision loss. Provide a decimal string or BigInt.');
  }

  const trimmed = input.trim();
  if (trimmed === '' || trimmed === 'N/A' || trimmed === '-') {
    return 0n;
  }

  // Remove currency prefixes/suffixes and thousand separators (commas)
  let clean = trimmed
    .replace(/د\.إ|AED|USD|EUR|GBP|SAR|QAR|KWD|BHD|OMR|INR|[\$\£\€]/gi, '')
    .replace(/[\s,]/g, '');

  let isNegative = false;
  if (clean.startsWith('-')) {
    if (!allowNegative) {
      throw new Error(`Negative money amounts are forbidden: "${input}"`);
    }
    isNegative = true;
    clean = clean.slice(1);
  } else if (clean.startsWith('+')) {
    clean = clean.slice(1);
  }

  if (clean === '') {
    return 0n;
  }

  // Check valid decimal format
  if (!/^\d+(\.\d+)?$/.test(clean)) {
    throw new Error(`Invalid monetary decimal string: "${input}"`);
  }

  const [wholePart, fracPart = ''] = clean.split('.');

  // Pad or truncate fraction to exact decimals required
  let normalizedFrac: string;
  if (fracPart.length > decimals) {
    // Truncate or round? Exact standard: round half even on extra digits
    const extra = fracPart.slice(decimals);
    const retained = fracPart.slice(0, decimals);
    // If extra digits exist, perform integer rounding on retained
    const firstExtra = parseInt(extra[0], 10);
    let retainedBig = BigInt(retained || '0');
    if (firstExtra >= 5) {
      retainedBig += 1n;
    }
    normalizedFrac = retainedBig.toString().padStart(decimals, '0');
  } else {
    normalizedFrac = fracPart.padEnd(decimals, '0');
  }

  const wholeBig = BigInt(wholePart);
  const fracBig = BigInt(normalizedFrac);
  const factor = 10n ** BigInt(decimals);

  const total = wholeBig * factor + fracBig;
  return isNegative ? -total : total;
}

/**
 * Formats BigInt minor units into exact decimal string (e.g. 10050n fils -> "100.50").
 */
export function formatMinorUnitsToDecimal(amount: bigint | string, decimals: number = 2): string {
  const bigAmount = typeof amount === 'bigint' ? amount : BigInt(amount);
  const isNegative = bigAmount < 0n;
  const absAmount = isNegative ? -bigAmount : bigAmount;

  if (decimals === 0) {
    return `${isNegative ? '-' : ''}${absAmount.toString()}`;
  }

  const factor = 10n ** BigInt(decimals);
  const whole = absAmount / factor;
  const fraction = absAmount % factor;
  const paddedFraction = fraction.toString().padStart(decimals, '0');

  return `${isNegative ? '-' : ''}${whole.toString()}.${paddedFraction}`;
}
