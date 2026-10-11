/**
 * UAE Tax Registration Number (TRN) Validator.
 * Rules:
 * 1. Must be exactly 15 numeric digits.
 * 2. In the UAE, TRNs strictly start with '100' for VAT registered businesses.
 */
export function isValidUaeTrn(trn: string): boolean {
  if (!trn || typeof trn !== 'string') {
    return false;
  }
  const cleanTrn = trn.trim();
  if (cleanTrn.length !== 15) {
    return false;
  }
  if (!/^\d{15}$/.test(cleanTrn)) {
    return false;
  }
  // UAE FTA TRNs issue format starts with '100'
  return cleanTrn.startsWith('100');
}
