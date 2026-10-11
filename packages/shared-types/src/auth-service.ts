import argon2 from 'argon2';
import { generateSecret, verifySync } from 'otplib';
import { createCipheriv, createDecipheriv, randomBytes, createHmac, createHash } from 'node:crypto';
import { Pool } from 'pg';
import { UserRole } from './index.js';

export interface UserSessionPayload {
  sessionId?: string;
  userId: string;
  tenantId: string;
  entityId: string;
  role: UserRole;
  email: string;
  issuedAt: number;
  expiresAt: number;
}

export interface AuthRateLimitStatus {
  isLocked: boolean;
  attemptsRemaining: number;
  lockoutRemainingMs?: number;
}

export interface ActiveSessionRecord {
  id: string;
  tenantId: string;
  entityId: string | null;
  userId: string;
  sessionTokenHash: string;
  role: UserRole;
  ipAddress: string | null;
  userAgent: string | null;
  isRevoked: boolean;
  issuedAt: Date;
  expiresAt: Date;
  lastActiveAt: Date;
}

/**
 * Validates cryptographic secret keys strictly without fallbacks or padding.
 * Must be at least 32 bytes (256 bits).
 */
export function validateKeyLength(key: string | undefined, keyName: string): Buffer {
  if (!key) {
    throw new Error(`CRITICAL_SECURITY_FAILURE: ${keyName} is missing. Refusing startup without cryptographic key.`);
  }

  let buf: Buffer;
  // If hex string of length >= 64, parse as hex (32 bytes)
  if (/^[0-9a-fA-F]{64,}$/.test(key)) {
    buf = Buffer.from(key, 'hex');
  } else if (/^[A-Za-z0-9+/=]{44,}$/.test(key) && !key.includes(' ')) {
    // If base64 of >= 44 chars (32 bytes)
    buf = Buffer.from(key, 'base64');
  } else {
    // UTF-8 string
    buf = Buffer.from(key, 'utf8');
  }

  if (buf.length < 32) {
    throw new Error(`CRITICAL_SECURITY_FAILURE: ${keyName} is shorter than 32 bytes (${buf.length} bytes received). Key padding or fallbacks are strictly prohibited.`);
  }

  return buf;
}

/**
 * Production-ready Authentication Service
 * Follows OWASP ASVS Level 2 requirements:
 * 1. Argon2id password hashing (memoryCost: 65536, timeCost: 3, parallelism: 4)
 * 2. RFC 6238 TOTP with AES-256-GCM encrypted secrets (32-byte validated key, zero padding)
 * 3. HMAC-SHA256 cryptographically signed session tokens
 * 4. Database-backed & in-memory rate limiting with brute-force lockout
 * 5. Database-backed sessions table with server-side revocation and rotation
 */
export class AuthenticationService {
  private static inMemoryFailedAttempts: Map<string, { count: number; lockedUntil?: number }> = new Map();

  /**
   * Hashes plain-text password using Argon2id strictly
   */
  static async hashPassword(password: string): Promise<string> {
    if (!password || password.length < 10) {
      throw new Error('Password must meet minimum length of 10 characters per OWASP ASVS');
    }
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4
    });
  }

  /**
   * Verifies password against stored Argon2id hash strictly
   */
  static async verifyPassword(hash: string, password: string): Promise<boolean> {
    if (!hash || !password) return false;
    if (!hash.startsWith('$argon2id$')) {
      return false; // Rejects legacy, plaintext or insecure hashes
    }
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Encrypts a TOTP secret using AES-256-GCM.
   * Key must be strictly validated (>= 32 bytes) - no padding.
   */
  static encryptSecret(secret: string, keyOrHex: string): string {
    const keyBuf = validateKeyLength(keyOrHex, 'TOTP_ENCRYPTION_KEY').subarray(0, 32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypts a TOTP secret using AES-256-GCM.
   * Key must be strictly validated (>= 32 bytes) - no padding.
   */
  static decryptSecret(cipherPayload: string, keyOrHex: string): string {
    const [ivHex, authTagHex, encrypted] = cipherPayload.split(':');
    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Malformed encrypted secret payload');
    }
    const keyBuf = validateKeyLength(keyOrHex, 'TOTP_ENCRYPTION_KEY').subarray(0, 32);
    const decipher = createDecipheriv('aes-256-gcm', keyBuf, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Generates a new RFC 6238 TOTP secret
   */
  static generateTotpSecret(): string {
    return generateSecret();
  }

  /**
   * Validates a 6-digit TOTP code against decrypted secret
   */
  static verifyTotp(code: string, secret: string): boolean {
    if (!code || !secret) return false;
    const res = verifySync({ token: code.trim(), secret });
    return Boolean(res && res.valid);
  }

  /**
   * Generates single-use alphanumeric recovery codes
   */
  static generateRecoveryCodes(count: number = 8): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      codes.push(randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  /**
   * Hashes a recovery code for one-time storage
   */
  static hashRecoveryCode(code: string): string {
    return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
  }

  /**
   * Hashes a session token for lookup in the sessions table
   */
  static hashSessionToken(token: string): string {
    return createHash('sha256').update(token.trim()).digest('hex');
  }

  /**
   * Signs a tamper-evident session token
   */
  static signSessionToken(payload: UserSessionPayload, secret: string): string {
    validateKeyLength(secret, 'JWT_SECRET');
    const dataString = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', secret).update(dataString).digest('base64url');
    return `${dataString}.${signature}`;
  }

  /**
   * Verifies and decodes a session token cryptographically
   */
  static verifySessionToken(token: string, secret: string): UserSessionPayload | null {
    try {
      validateKeyLength(secret, 'JWT_SECRET');
      const parts = token.split('.');
      if (parts.length !== 2) return null;
      const [dataString, providedSignature] = parts;

      const expectedSignature = createHmac('sha256', secret).update(dataString).digest('base64url');
      if (providedSignature !== expectedSignature) {
        return null; // Tamper detected
      }

      const payload: UserSessionPayload = JSON.parse(Buffer.from(dataString, 'base64url').toString('utf8'));
      if (Date.now() > payload.expiresAt) {
        return null; // Expired session
      }

      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Database-backed or in-memory rate limiting check
   */
  static async checkRateLimit(
    identifier: string,
    pool?: Pool,
    maxAttempts: number = 5,
    lockoutDurationMs: number = 15 * 60 * 1000
  ): Promise<AuthRateLimitStatus> {
    if (pool) {
      try {
        const res = await pool.query(
          'SELECT failed_attempts, locked_until FROM auth_rate_limits WHERE identifier = $1',
          [identifier]
        );
        if (res.rows.length === 0) {
          return { isLocked: false, attemptsRemaining: maxAttempts };
        }
        const row = res.rows[0];
        const lockedUntil = row.locked_until ? new Date(row.locked_until).getTime() : null;

        if (lockedUntil && lockedUntil > Date.now()) {
          return {
            isLocked: true,
            attemptsRemaining: 0,
            lockoutRemainingMs: lockedUntil - Date.now()
          };
        }

        if (lockedUntil && lockedUntil <= Date.now()) {
          // Lockout expired - reset in DB
          await pool.query('DELETE FROM auth_rate_limits WHERE identifier = $1', [identifier]);
          return { isLocked: false, attemptsRemaining: maxAttempts };
        }

        const remaining = Math.max(0, maxAttempts - row.failed_attempts);
        return {
          isLocked: remaining === 0,
          attemptsRemaining: remaining
        };
      } catch {
        // Fall back to in-memory check if DB fails
      }
    }

    // In-memory fallback
    const record = this.inMemoryFailedAttempts.get(identifier);
    if (!record) {
      return { isLocked: false, attemptsRemaining: maxAttempts };
    }

    if (record.lockedUntil && record.lockedUntil > Date.now()) {
      return {
        isLocked: true,
        attemptsRemaining: 0,
        lockoutRemainingMs: record.lockedUntil - Date.now()
      };
    }

    if (record.lockedUntil && record.lockedUntil <= Date.now()) {
      this.inMemoryFailedAttempts.delete(identifier);
      return { isLocked: false, attemptsRemaining: maxAttempts };
    }

    const remaining = Math.max(0, maxAttempts - record.count);
    return {
      isLocked: remaining === 0,
      attemptsRemaining: remaining
    };
  }

  /**
   * Database-backed or in-memory recording of failed attempt
   */
  static async recordFailedAttempt(
    identifier: string,
    pool?: Pool,
    maxAttempts: number = 5,
    lockoutDurationMs: number = 15 * 60 * 1000
  ): Promise<AuthRateLimitStatus> {
    if (pool) {
      try {
        const client = await pool.connect();
        try {
          const res = await client.query(
            'SELECT failed_attempts, locked_until FROM auth_rate_limits WHERE identifier = $1 FOR UPDATE',
            [identifier]
          );

          let count = 1;
          if (res.rows.length > 0) {
            count = res.rows[0].failed_attempts + 1;
          }

          let lockedUntil: Date | null = null;
          if (count >= maxAttempts) {
            lockedUntil = new Date(Date.now() + lockoutDurationMs);
          }

          await client.query(
            `INSERT INTO auth_rate_limits (identifier, failed_attempts, locked_until, last_attempt_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (identifier) DO UPDATE
             SET failed_attempts = $2, locked_until = $3, last_attempt_at = NOW()`,
            [identifier, count, lockedUntil]
          );
        } finally {
          client.release();
        }
        return this.checkRateLimit(identifier, pool, maxAttempts, lockoutDurationMs);
      } catch {
        // Fall through to in-memory
      }
    }

    // In-memory record
    const record = this.inMemoryFailedAttempts.get(identifier) ?? { count: 0 };
    record.count += 1;
    if (record.count >= maxAttempts) {
      record.lockedUntil = Date.now() + lockoutDurationMs;
    }
    this.inMemoryFailedAttempts.set(identifier, record);
    return this.checkRateLimit(identifier, undefined, maxAttempts, lockoutDurationMs);
  }

  /**
   * Resets failed attempts upon successful login
   */
  static async resetAttempts(identifier: string, pool?: Pool): Promise<void> {
    this.inMemoryFailedAttempts.delete(identifier);
    if (pool) {
      try {
        await pool.query('DELETE FROM auth_rate_limits WHERE identifier = $1', [identifier]);
      } catch {
        // Ignore DB deletion errors
      }
    }
  }

  /**
   * Creates a database session record for server-side tracking and revocation
   */
  static async createSession(
    pool: Pool,
    params: {
      tenantId: string;
      entityId?: string | null;
      userId: string;
      role: UserRole;
      sessionToken: string;
      expiresAt: Date;
      ipAddress?: string | null;
      userAgent?: string | null;
    }
  ): Promise<string> {
    const tokenHash = this.hashSessionToken(params.sessionToken);
    const client = await pool.connect();
    try {
      if (!(pool as any).isPgMem && !(client as any).isPgMem) {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [params.tenantId]);
      }
      const res = await client.query(
        `INSERT INTO sessions (
          tenant_id, entity_id, user_id, session_token_hash, role,
          ip_address, user_agent, is_revoked, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8)
        RETURNING id`,
        [
          params.tenantId,
          params.entityId || null,
          params.userId,
          tokenHash,
          params.role,
          params.ipAddress || null,
          params.userAgent || null,
          params.expiresAt
        ]
      );
      if (!(pool as any).isPgMem && !(client as any).isPgMem) {
        await client.query('COMMIT');
      }
      return res.rows[0].id;
    } catch (err) {
      if (!(pool as any).isPgMem && !(client as any).isPgMem) {
        await client.query('ROLLBACK');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Validates a session against the database sessions table
   */
  static async validateSessionInDb(
    pool: Pool,
    tenantId: string,
    sessionToken: string
  ): Promise<{ isValid: boolean; session?: ActiveSessionRecord }> {
    const tokenHash = this.hashSessionToken(sessionToken);
    const client = await pool.connect();
    try {
      if (!(pool as any).isPgMem && !(client as any).isPgMem) {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      }
      const res = await client.query(
        `SELECT id, tenant_id, entity_id, user_id, session_token_hash, role,
                ip_address, user_agent, is_revoked, issued_at, expires_at, last_active_at
         FROM sessions
         WHERE session_token_hash = $1 AND tenant_id = $2`,
        [tokenHash, tenantId]
      );
      if (!(pool as any).isPgMem && !(client as any).isPgMem) {
        await client.query('COMMIT');
      }

      if (res.rows.length === 0) {
        return { isValid: false };
      }

      const row = res.rows[0];
      const isExpired = new Date(row.expires_at).getTime() < Date.now();
      if (row.is_revoked || isExpired) {
        return { isValid: false };
      }

      // Update last active timestamp
      await client.query('UPDATE sessions SET last_active_at = NOW() WHERE id = $1', [row.id]);

      return {
        isValid: true,
        session: {
          id: row.id,
          tenantId: row.tenant_id,
          entityId: row.entity_id,
          userId: row.user_id,
          sessionTokenHash: row.session_token_hash,
          role: row.role as UserRole,
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
          isRevoked: row.is_revoked,
          issuedAt: new Date(row.issued_at),
          expiresAt: new Date(row.expires_at),
          lastActiveAt: new Date(row.last_active_at)
        }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Revokes a session by session token or ID
   */
  static async revokeSession(
    pool: Pool,
    tenantId: string,
    sessionTokenOrId: string,
    reason: string = 'USER_LOGOUT'
  ): Promise<boolean> {
    const tokenHash = this.hashSessionToken(sessionTokenOrId);
    const client = await pool.connect();
    try {
      if (!(pool as any).isPgMem && !(client as any).isPgMem) {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      }
      const res = await client.query(
        `UPDATE sessions
         SET is_revoked = TRUE, revoked_at = NOW(), revoked_reason = $1
         WHERE (session_token_hash = $2 OR id::text = $3) AND tenant_id = $4`,
        [reason, tokenHash, sessionTokenOrId, tenantId]
      );
      if (!(pool as any).isPgMem && !(client as any).isPgMem) {
        await client.query('COMMIT');
      }
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      if (!(pool as any).isPgMem && !(client as any).isPgMem) {
        await client.query('ROLLBACK');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Rotates a session: revokes existing session and creates a new one
   */
  static async rotateSession(
    pool: Pool,
    params: {
      tenantId: string;
      oldSessionToken: string;
      newSessionToken: string;
      newExpiresAt: Date;
    }
  ): Promise<{ rotated: boolean; newSessionId?: string }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (!(pool as any).isPgMem && !(client as any).isPgMem) {
        await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [params.tenantId]);
      }

      const oldHash = this.hashSessionToken(params.oldSessionToken);
      const res = await client.query(
        `SELECT id, tenant_id, entity_id, user_id, role, ip_address, user_agent, is_revoked, expires_at
         FROM sessions
         WHERE session_token_hash = $1 AND tenant_id = $2 FOR UPDATE`,
        [oldHash, params.tenantId]
      );

      if (res.rows.length === 0 || res.rows[0].is_revoked || new Date(res.rows[0].expires_at).getTime() < Date.now()) {
        await client.query('ROLLBACK');
        return { rotated: false };
      }

      const oldSession = res.rows[0];

      // Revoke old session
      await client.query(
        'UPDATE sessions SET is_revoked = TRUE, revoked_at = NOW(), revoked_reason = $1 WHERE id = $2',
        ['SESSION_ROTATION', oldSession.id]
      );

      // Create new session
      const newHash = this.hashSessionToken(params.newSessionToken);
      const insertRes = await client.query(
        `INSERT INTO sessions (
          tenant_id, entity_id, user_id, session_token_hash, role,
          ip_address, user_agent, is_revoked, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8)
        RETURNING id`,
        [
          oldSession.tenant_id,
          oldSession.entity_id,
          oldSession.user_id,
          newHash,
          oldSession.role,
          oldSession.ip_address,
          oldSession.user_agent,
          params.newExpiresAt
        ]
      );

      await client.query('COMMIT');
      return { rotated: true, newSessionId: insertRes.rows[0].id };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}
