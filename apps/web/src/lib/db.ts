import { Pool, PoolConfig } from 'pg';
import { validateKeyLength } from '@ledger-ae/shared-types';

/**
 * Server-side Database & Secrets configuration.
 * Fails startup immediately if required secrets are missing or shorter than 32 bytes.
 */

// Global pool cache for Next.js / serverless environments
let poolInstance: Pool | null = null;

export function getValidatedSecrets() {
  const jwtSecret = process.env.JWT_SECRET;
  const totpKey = process.env.TOTP_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;

  // Enforce minimum 32 bytes strictly; no fallbacks, no key padding
  validateKeyLength(jwtSecret, 'JWT_SECRET');
  validateKeyLength(totpKey, 'ENCRYPTION_KEY');

  return {
    jwtSecret: jwtSecret as string,
    encryptionKey: totpKey as string
  };
}

export function getDatabasePool(): Pool {
  if (poolInstance) {
    return poolInstance;
  }

  const connectionString = process.env.DATABASE_URL;
  const config: PoolConfig = connectionString
    ? { connectionString }
    : {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
        database: process.env.POSTGRES_DB || 'ledger_ae',
        user: process.env.POSTGRES_USER || 'ledger_app',
        password: process.env.POSTGRES_PASSWORD || '',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      };

  poolInstance = new Pool(config);
  return poolInstance;
}
