import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AuthenticationService, UserRole, Permission, RbacService } from './index.js';

describe('Phase 2 Authentication & Access Control Suite', () => {
  const secretKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const jwtSecret = 'test_jwt_secret_with_minimum_32_characters_for_hmac_sha256';

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

      const isInvalid = await AuthenticationService.verifyPassword(hash, 'WrongPassword#2026');
      assert.equal(isInvalid, false);
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

    test('generates valid 8-character recovery codes', () => {
      const codes = AuthenticationService.generateRecoveryCodes(8);
      assert.equal(codes.length, 8);
      codes.forEach((code) => {
        assert.equal(code.length, 8);
        assert.match(code, /^[0-9A-F]{8}$/);
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

    test('rejects tampered session tokens', () => {
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
      // Tamper with the token's payload by modifying characters in data segment
      const [data, sig] = token.split('.');
      const tampered = `${data.slice(0, -2)}xx.${sig}`;

      const verified = AuthenticationService.verifySessionToken(tampered, jwtSecret);
      assert.equal(verified, null);
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

  describe('Brute-force Protection & Rate Limiting', () => {
    test('locks out identifier after 5 failed login attempts', () => {
      const ip = '192.168.1.150';
      AuthenticationService.resetAttempts(ip);

      let status = AuthenticationService.checkRateLimit(ip);
      assert.equal(status.isLocked, false);
      assert.equal(status.attemptsRemaining, 5);

      for (let i = 1; i <= 4; i++) {
        status = AuthenticationService.recordFailedAttempt(ip);
        assert.equal(status.isLocked, false);
        assert.equal(status.attemptsRemaining, 5 - i);
      }

      // 5th attempt locks
      status = AuthenticationService.recordFailedAttempt(ip);
      assert.equal(status.isLocked, true);
      assert.equal(status.attemptsRemaining, 0);
      assert.ok((status.lockoutRemainingMs ?? 0) > 0);

      // Subsequent checks report locked
      const checkStatus = AuthenticationService.checkRateLimit(ip);
      assert.equal(checkStatus.isLocked, true);

      // Reset upon success
      AuthenticationService.resetAttempts(ip);
      const resetStatus = AuthenticationService.checkRateLimit(ip);
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
