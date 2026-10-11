import { AccountingTemporalClient } from '@ledger-ae/ledger-core';

let temporalClientInstance: AccountingTemporalClient | null = null;

/**
 * Returns a singleton instance of the AccountingTemporalClient for Next.js API routes.
 */
export function getTemporalClient(): AccountingTemporalClient {
  if (!temporalClientInstance) {
    temporalClientInstance = new AccountingTemporalClient();
  }
  return temporalClientInstance;
}
