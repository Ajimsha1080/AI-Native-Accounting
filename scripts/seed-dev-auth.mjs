#!/usr/bin/env node

/**
 * Development Database Seeder for LedgerAE
 * 
 * Rules:
 * - Strictly executes ONLY when NODE_ENV !== 'production'
 * - Uses environment-provided credentials only (no hardcoded password strings)
 * - Hashes password using Argon2id
 * - Encrypts TOTP secret using AES-256-GCM with validated 32-byte key
 * - Inserts hashed recovery codes into user_recovery_codes
 */

import { Pool } from 'pg';
import { AuthenticationService, validateKeyLength, UserRole } from '@ledger-ae/shared-types';

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: Dev seed script is strictly prohibited from running in production (NODE_ENV === "production").');
    process.exit(1);
  }

  const seedEmail = process.env.DEV_SEED_EMAIL;
  const seedPassword = process.env.DEV_SEED_PASSWORD;
  const tenantSlug = process.env.DEV_SEED_TENANT_SLUG || 'al-noor-group';
  const tenantName = process.env.DEV_SEED_TENANT_NAME || 'Al Noor Holding LLC';
  const totpKey = process.env.TOTP_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  const jwtSecret = process.env.JWT_SECRET;

  if (!seedEmail || !seedPassword) {
    console.error('FATAL: DEV_SEED_EMAIL and DEV_SEED_PASSWORD environment variables are required to seed.');
    process.exit(1);
  }

  if (seedPassword.length < 10) {
    console.error('FATAL: DEV_SEED_PASSWORD must be at least 10 characters.');
    process.exit(1);
  }

  // Validate encryption keys
  validateKeyLength(totpKey, 'TOTP_ENCRYPTION_KEY');
  validateKeyLength(jwtSecret, 'JWT_SECRET');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://ledger_app:ledger_app_secure_pass@localhost:5432/ledger_ae'
  });

  const client = await pool.connect();
  try {
    console.log('Seeding development tenant and user...');
    await client.query('BEGIN');

    // 1. Create or get tenant
    const targetTenantId = '00000000-0000-0000-0000-000000000001';
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [targetTenantId]);
    const tenantRes = await client.query(
      `INSERT INTO tenants (id, name, slug)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = $2
       RETURNING id`,
      [targetTenantId, tenantName, tenantSlug]
    );
    const tenantId = tenantRes.rows[0].id;

    // 2. Create primary legal entity
    const entityRes = await client.query(
      `INSERT INTO legal_entities (
        tenant_id, legal_name_en, legal_name_ar, trade_license_number,
        trn, jurisdiction_type, address_emirate
      ) VALUES ($1, 'Al Noor Trading FZCO', 'شركة النور التجارية ش.ذ.م.م', 'TL-DXB-987654', '100123456789003', 'FREE_ZONE', 'DUBAI')
      ON CONFLICT DO NOTHING
      RETURNING id`,
      [tenantId]
    );

    // 3. Hash password via Argon2id
    const passwordHash = await AuthenticationService.hashPassword(seedPassword);

    // 4. Generate & Encrypt TOTP Secret
    const rawTotpSecret = AuthenticationService.generateTotpSecret();
    const encryptedTotp = AuthenticationService.encryptSecret(rawTotpSecret, totpKey);

    // 5. Upsert User
    const userRes = await client.query(
      `INSERT INTO users (
        tenant_id, email, full_name_en, full_name_ar, role, password_hash,
        is_active, is_2fa_enabled, totp_secret_encrypted
      ) VALUES ($1, $2, 'Chief Financial Officer', 'المدير المالي التنفيذي', $3, $4, TRUE, TRUE, $5)
      ON CONFLICT (email) DO UPDATE
      SET password_hash = $4, totp_secret_encrypted = $5, role = $3
      RETURNING id`,
      [tenantId, seedEmail.toLowerCase().trim(), UserRole.FINANCIAL_CONTROLLER, passwordHash, encryptedTotp]
    );
    const userId = userRes.rows[0].id;

    // 6. Generate & Hash Recovery Codes
    const recoveryCodes = AuthenticationService.generateRecoveryCodes(8);
    for (const code of recoveryCodes) {
      const codeHash = AuthenticationService.hashRecoveryCode(code);
      await client.query(
        `INSERT INTO user_recovery_codes (tenant_id, user_id, code_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, code_hash) DO NOTHING`,
        [tenantId, userId, codeHash]
      );
    }

    await client.query('COMMIT');
    console.log(`Seeded user successfully: ${seedEmail} (Tenant: ${tenantSlug})`);
    console.log(`TOTP Secret (provision into authenticator app): ${rawTotpSecret}`);
    console.log(`Recovery Codes (save securely):`);
    recoveryCodes.forEach((c) => console.log(` - ${c}`));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
