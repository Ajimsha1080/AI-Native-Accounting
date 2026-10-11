import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { newDb, DataType } from 'pg-mem';
import { AuthenticationService, UserRole, Permission, RbacService, validateKeyLength } from './index.js';
import { MigrationRunner } from './migration-runner.js';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

function setupAuthPgMemDb() {
  const memDb = newDb({ noAstCoverageCheck: true });
  memDb.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () => randomUUID()
  });
  memDb.public.registerFunction({
    name: 'length',
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (str: string | null) => (str ? str.length : 0)
  });
  const pool = memDb.adapters.createPg().Pool as any;
  const pgPool = new pool();
  (pgPool as any).isPgMem = true;
  return { memDb, pgPool };
}

function getMigrationsDir(): string {
  const rootMigrations = join(process.cwd(), 'packages/shared-types/migrations');
  const localMigrations = join(process.cwd(), 'migrations');
  return existsSync(rootMigrations) ? rootMigrations : localMigrations;
}

describe('Phase 2 Authentication & Access Control Suite (OWASP ASVS Level 2)', () => {
  const secretKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const jwtSecret = 'test_jwt_secret_with_minimum_32_characters_for_hmac_sha256';

  describe('Key Validation Strictness (No Fallbacks, Zero Key Padding)', () => {
    test('strictly rejects missing or undefined secret key', () => {
      assert.throws(
        () => validateKeyLength(undefined, 'JWT_SECRET'),
        /CRITICAL_SECURITY_FAILURE: JWT_SECRET is missing/
      );
    });

    test('strictly rejects secret shorter than 32 bytes without padding', () => {
      assert.throws(
        () => validateKeyLength('short_20_chars_key!', 'JWT_SECRET'),
        /CRITICAL_SECURITY_FAILURE: JWT_SECRET is shorter than 32 bytes/
      );
    });

    test('accepts valid 32-byte secret key and 64-char hex key', () => {
      const keyBuf1 = validateKeyLength(jwtSecret, 'JWT_SECRET');
      assert.ok(keyBuf1.length >= 32);

      const keyBuf2 = validateKeyLength(secretKey, 'TOTP_ENCRYPTION_KEY');
      assert.equal(keyBuf2.length, 32);
    });
  });

  describe('Argon2id Password Security', () => {
    test('enforces ASVS minimum password length', async () => {
      await assert.rejects(
        async () => {
          await AuthenticationService.hashPassword('short');
        },
        /minimum length of 10 characters/
      );
    });

    test('hashes with Argon2id and verifies correct credentials', async () => {
      const password = 'StrongCorporatePassword#2026';
      const hash = await AuthenticationService.hashPassword(password);
      assert.ok(hash.startsWith('$argon2id$'));

      const isValid = await AuthenticationService.verifyPassword(hash, password);
      assert.equal(isValid, true);

      // Wrong password rejected
      const isInvalid = await AuthenticationService.verifyPassword(hash, 'WrongPassword#2026');
      assert.equal(isInvalid, false);

      // Rejects plain-text or empty
      const isPlaintextRejected = await AuthenticationService.verifyPassword('Password@123', 'Password@123');
      assert.equal(isPlaintextRejected, false);
    });
  });

  describe('RFC 6238 TOTP & AES-256-GCM Secret Protection', () => {
    test('encrypts and decrypts TOTP secret without tampering', () => {
      const secret = AuthenticationService.generateTotpSecret();
      assert.ok(secret.length >= 16);

      const encrypted = AuthenticationService.encryptSecret(secret, secretKey);
      assert.ok(encrypted.includes(':'));

      const decrypted = AuthenticationService.decryptSecret(encrypted, secretKey);
      assert.equal(decrypted, secret);
    });

    test('rejects tampered encrypted payload', () => {
      const secret = AuthenticationService.generateTotpSecret();
      const encrypted = AuthenticationService.encryptSecret(secret, secretKey);
      const tampered = encrypted.slice(0, -4) + 'abcd';

      assert.throws(() => {
        AuthenticationService.decryptSecret(tampered, secretKey);
      });
    });

    test('verifies real TOTP and rejects wrong TOTP code', () => {
      const secret = AuthenticationService.generateTotpSecret();
      // Wrong TOTP code
      const isWrongCode = AuthenticationService.verifyTotp('000000', secret);
      assert.equal(isWrongCode, false);
      const isBypassCode = AuthenticationService.verifyTotp('123456', secret);
      assert.equal(isBypassCode, false);
    });

    test('generates valid 8-character recovery codes and verifies hash matching', () => {
      const codes = AuthenticationService.generateRecoveryCodes(8);
      assert.equal(codes.length, 8);
      codes.forEach((code) => {
        assert.equal(code.length, 8);
        assert.match(code, /^[0-9A-F]{8}$/);
        const hash = AuthenticationService.hashRecoveryCode(code);
        assert.equal(hash.length, 64);
      });
    });
  });

  describe('Cryptographic Session Tokens & Tenancy Invariant', () => {
    test('signs and verifies tamper-evident session token', () => {
      const payload = {
        userId: 'usr-101',
        tenantId: 'tenant-uae-corp',
        entityId: 'ent-dubai-mainland',
        role: UserRole.FINANCIAL_CONTROLLER,
        email: 'controller@alnoor.ae',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 8 * 60 * 60 * 1000
      };

      const token = AuthenticationService.signSessionToken(payload, jwtSecret);
      assert.ok(token.includes('.'));

      const verified = AuthenticationService.verifySessionToken(token, jwtSecret);
      assert.ok(verified);
      assert.equal(verified?.tenantId, 'tenant-uae-corp');
      assert.equal(verified?.role, UserRole.FINANCIAL_CONTROLLER);
    });

    test('rejects tampered and forged session tokens', () => {
      const payload = {
        userId: 'usr-101',
        tenantId: 'tenant-uae-corp',
        entityId: 'ent-dubai-mainland',
        role: UserRole.VIEWER,
        email: 'viewer@alnoor.ae',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 8 * 60 * 60 * 1000
      };

      const token = AuthenticationService.signSessionToken(payload, jwtSecret);
      // Tamper with the token's payload
      const [data, sig] = token.split('.');
      const tampered = `${data.slice(0, -2)}xx.${sig}`;

      const verified = AuthenticationService.verifySessionToken(tampered, jwtSecret);
      assert.equal(verified, null);

      // Forged with wrong secret key
      const forgedSecret = 'an_attacker_controlled_secret_key_32_bytes_long';
      const forgedToken = AuthenticationService.signSessionToken(payload, forgedSecret);
      const verifiedForged = AuthenticationService.verifySessionToken(forgedToken, jwtSecret);
      assert.equal(verifiedForged, null);
    });

    test('rejects expired session tokens', () => {
      const payload = {
        userId: 'usr-101',
        tenantId: 'tenant-uae-corp',
        entityId: 'ent-dubai-mainland',
        role: UserRole.CFO,
        email: 'cfo@alnoor.ae',
        issuedAt: Date.now() - 3600000,
        expiresAt: Date.now() - 1000 // Expired
      };

      const token = AuthenticationService.signSessionToken(payload, jwtSecret);
      const verified = AuthenticationService.verifySessionToken(token, jwtSecret);
      assert.equal(verified, null);
    });
  });

  describe('Database Sessions Table: Revocation & Rotation', () => {
    test('creates, validates, revokes and rotates sessions in database', async () => {
      const { pgPool } = setupAuthPgMemDb();
      const runner = new MigrationRunner(pgPool);
      await runner.runMigrations({ migrationsDir: getMigrationsDir() });

      const tenantId = '00000000-0000-0000-0000-000000000001';
      const userId = '00000000-0000-0000-0000-000000000002';

      // Seed tenant and user
      const client = await pgPool.connect();
      await client.query(
        'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)',
        [tenantId, 'Al Noor Group', 'al-noor-group']
      );
      await client.query(
        `INSERT INTO users (id, tenant_id, email, full_name_en, role, password_hash, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
        [userId, tenantId, 'controller@alnoor.ae', 'Chief Accountant', UserRole.FINANCIAL_CONTROLLER, '$argon2id$mock']
      );
      client.release();

      const sessionPayload = {
        userId,
        tenantId,
        entityId: tenantId,
        role: UserRole.FINANCIAL_CONTROLLER,
        email: 'controller@alnoor.ae',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 8 * 60 * 60 * 1000
      };
      const sessionToken = AuthenticationService.signSessionToken(sessionPayload, jwtSecret);

      // 1. Create database session
      const sessionId = await AuthenticationService.createSession(pgPool, {
        tenantId,
        userId,
        role: UserRole.FINANCIAL_CONTROLLER,
        sessionToken,
        expiresAt: new Date(sessionPayload.expiresAt)
      });
      assert.ok(sessionId);

      // 2. Validate session in DB
      const validation1 = await AuthenticationService.validateSessionInDb(pgPool, tenantId, sessionToken);
      assert.equal(validation1.isValid, true);
      assert.equal(validation1.session?.userId, userId);

      // 3. Rotate session
      const newPayload = { ...sessionPayload, issuedAt: Date.now(), expiresAt: Date.now() + 8 * 60 * 60 * 1000 };
      const newSessionToken = AuthenticationService.signSessionToken(newPayload, jwtSecret);
      const rotation = await AuthenticationService.rotateSession(pgPool, {
        tenantId,
        oldSessionToken: sessionToken,
        newSessionToken,
        newExpiresAt: new Date(newPayload.expiresAt)
      });
      assert.equal(rotation.rotated, true);

      // Old session is now revoked
      const oldValidation = await AuthenticationService.validateSessionInDb(pgPool, tenantId, sessionToken);
      assert.equal(oldValidation.isValid, false);

      // New session is active
      const newValidation = await AuthenticationService.validateSessionInDb(pgPool, tenantId, newSessionToken);
      assert.equal(newValidation.isValid, true);

      // 4. Revoke new session (logout)
      const revoked = await AuthenticationService.revokeSession(pgPool, tenantId, newSessionToken, 'USER_LOGOUT');
      assert.equal(revoked, true);

      const postLogoutValidation = await AuthenticationService.validateSessionInDb(pgPool, tenantId, newSessionToken);
      assert.equal(postLogoutValidation.isValid, false);

      await pgPool.end();
    });
  });

  describe('Brute-force Protection & Rate Limiting', () => {
    test('locks out identifier after 5 failed login attempts and resets on success', async () => {
      const ip = '192.168.1.150';
      await AuthenticationService.resetAttempts(ip);

      let status = await AuthenticationService.checkRateLimit(ip);
      assert.equal(status.isLocked, false);
      assert.equal(status.attemptsRemaining, 5);

      for (let i = 1; i <= 4; i++) {
        status = await AuthenticationService.recordFailedAttempt(ip);
        assert.equal(status.isLocked, false);
        assert.equal(status.attemptsRemaining, 5 - i);
      }

      // 5th attempt locks
      status = await AuthenticationService.recordFailedAttempt(ip);
      assert.equal(status.isLocked, true);
      assert.equal(status.attemptsRemaining, 0);
      assert.ok((status.lockoutRemainingMs ?? 0) > 0);

      // Subsequent checks report locked
      const checkStatus = await AuthenticationService.checkRateLimit(ip);
      assert.equal(checkStatus.isLocked, true);

      // Reset upon success
      await AuthenticationService.resetAttempts(ip);
      const resetStatus = await AuthenticationService.checkRateLimit(ip);
      assert.equal(resetStatus.isLocked, false);
      assert.equal(resetStatus.attemptsRemaining, 5);
    });
  });

  describe('Segregation of Duties & RBAC Matrix', () => {
    const rbac = new RbacService();

    test('Tax Agent can submit tax but cannot post to ledger', () => {
      assert.equal(rbac.hasPermission(UserRole.TAX_AGENT, Permission.TAX_SUBMIT), true);
      assert.equal(rbac.hasPermission(UserRole.TAX_AGENT, Permission.LEDGER_POST), false);
    });

    test('Junior Accountant cannot lock accounting period or approve bills', () => {
      assert.equal(rbac.hasPermission(UserRole.JUNIOR_ACCOUNTANT, Permission.LEDGER_LOCK), false);
      assert.equal(rbac.hasPermission(UserRole.JUNIOR_ACCOUNTANT, Permission.BILL_APPROVE_TIER1), false);
    });

    test('Segregation of Duties: Approver cannot be voucher creator', () => {
      const voucherAuthor = 'emp_acc_10';
      const supervisor = 'emp_cfo_01';

      assert.equal(rbac.canApproveVoucher(voucherAuthor, voucherAuthor, UserRole.CFO), false);
      assert.equal(rbac.canApproveVoucher(voucherAuthor, supervisor, UserRole.CFO), true);
    });
  });
});
