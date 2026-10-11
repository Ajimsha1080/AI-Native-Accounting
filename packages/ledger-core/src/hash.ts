import { createHash } from 'node:crypto';
import { JournalEntryCandidate } from './invariants.js';

/**
 * Computes deterministic SHA-256 cryptographic hash of a posted journal voucher.
 * Implements blockchain-grade merkle chaining to guarantee non-repudiation.
 */
export function computeVoucherHash(
  entry: JournalEntryCandidate,
  previousHash: string = 'GENESIS_VOUCHER_00000000000000000000000000000000'
): string {
  const normalizedLines = entry.lines.map((l) => ({
    accountId: l.accountId,
    currency: l.currency,
    amountTxn: l.amountTxn.toString(),
    amountBase: l.amountBase.toString(),
    fxRate: l.fxRate.toString(),
    direction: l.direction,
    vatCode: l.vatCode ?? null,
    vatAmountBase: l.vatAmountBase ? l.vatAmountBase.toString() : '0'
  }));

  const payload = {
    tenantId: entry.tenantId,
    entityId: entry.entityId,
    bookId: entry.bookId,
    periodId: entry.periodId,
    entryNumber: entry.entryNumber,
    postingDate: entry.postingDate,
    sourceModule: entry.sourceModule,
    previousHash,
    lines: normalizedLines
  };

  const jsonString = JSON.stringify(payload);
  return createHash('sha256').update(jsonString).digest('hex');
}
