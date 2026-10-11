/**
 * Shared Zero-Float Money Formatter for UAE Fils and Multi-Currency
 * Never uses floating-point arithmetic.
 */

/**
 * Formats BigInt or string minor units into exact decimal string (e.g. 10050n fils -> "100.50").
 */
export function formatMinorUnitsToDecimal(amount: bigint | string | number, decimals: number = 2): string {
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

export interface MoneyFormatOptions {
  currency?: string;
  locale?: 'en' | 'ar';
  numeralSystem?: 'latn' | 'arab';
  showCurrencySymbol?: boolean;
}

/**
 * Formats integer minor units (fils/cents) to localized bilingual currency string
 * @param minorUnits BigInt or number integer minor units (e.g. 150000n = AED 1,500.00)
 * @param options Locale and formatting configuration
 */
export function formatMinorUnits(
  minorUnits: bigint | number,
  options: MoneyFormatOptions = {}
): string {
  const {
    currency = 'AED',
    locale = 'en',
    numeralSystem = locale === 'ar' ? 'arab' : 'latn',
    showCurrencySymbol = true
  } = options;

  const minor = typeof minorUnits === 'number' ? BigInt(Math.trunc(minorUnits)) : minorUnits;
  const isNegative = minor < 0n;
  const absMinor = isNegative ? -minor : minor;

  // Assuming standard 2 minor unit decimal places (AED fils, USD cents, EUR cents)
  const integerPart = absMinor / 100n;
  const fractionalPart = absMinor % 100n;
  const fractionalStr = fractionalPart.toString().padStart(2, '0');

  // Format integer portion with thousands grouping according to locale & numbering system
  const localeTag = `${locale}-u-nu-${numeralSystem}`;
  const intFormatted = new Intl.NumberFormat(localeTag, {
    useGrouping: true
  }).format(integerPart);

  // Convert fractional part digits to chosen numeral system if Arabic-Indic
  let localizedFraction = fractionalStr;
  if (numeralSystem === 'arab') {
    const arabDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    localizedFraction = fractionalStr
      .split('')
      .map((d) => arabDigits[parseInt(d, 10)])
      .join('');
  }

  const decimalSeparator = locale === 'ar' ? '٫' : '.';
  const numericString = `${intFormatted}${decimalSeparator}${localizedFraction}`;
  const signedNumeric = isNegative ? (locale === 'ar' ? `${numericString}-` : `-${numericString}`) : numericString;

  if (!showCurrencySymbol) {
    return signedNumeric;
  }

  if (currency === 'AED') {
    if (locale === 'ar') {
      return `${signedNumeric} د.إ`;
    }
    return `AED ${signedNumeric}`;
  }

  return `${currency} ${signedNumeric}`;
}
