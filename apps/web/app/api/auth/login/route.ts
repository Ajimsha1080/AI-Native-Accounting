import { NextResponse } from 'next/server';
import { AuthenticationService, UserRole } from '@ledger-ae/shared-types';
import { getDatabasePool, getValidatedSecrets } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { jwtSecret } = getValidatedSecrets();
    const body = await request.json();
    const { email, password, tenantSlug } = body;

    if (!email || !password || !tenantSlug) {
      return NextResponse.json(
        { error: 'Email, password, and tenant slug are required' },
        { status: 400 }
      );
    }

    const pool = getDatabasePool();
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedTenantSlug = tenantSlug.toLowerCase().trim();
    const rateLimitKey = `${normalizedTenantSlug}:${normalizedEmail}`;

    // 1. Rate Limit & Brute-force Lockout Check (backed by database)
    const rateStatus = await AuthenticationService.checkRateLimit(rateLimitKey, pool);
    if (rateStatus.isLocked) {
      const waitMinutes = Math.ceil((rateStatus.lockoutRemainingMs || 0) / 60000);
      return NextResponse.json(
        { error: `Account temporarily locked due to excessive failed attempts. Try again in ${waitMinutes} minutes.` },
        { status: 429 }
      );
    }

    // 2. Query user and tenant from database
    const client = await pool.connect();
    let userRow: any = null;
    let tenantRow: any = null;
    try {
      const tenantRes = await client.query(
        'SELECT id, name_en, slug FROM tenants WHERE slug = $1 AND is_active = TRUE',
        [normalizedTenantSlug]
      );
      if (tenantRes.rows.length === 0) {
        await AuthenticationService.recordFailedAttempt(rateLimitKey, pool);
        return NextResponse.json(
          { error: 'Invalid credentials or organization not found.' },
          { status: 401 }
        );
      }
      tenantRow = tenantRes.rows[0];

      // Query user scoped to tenant
      await client.query('SET LOCAL app.current_tenant_id = $1', [tenantRow.id]);
      const userRes = await client.query(
        `SELECT u.id, u.tenant_id, u.email, u.full_name_en, u.role, u.password_hash,
                u.is_active, u.is_2fa_enabled, u.totp_secret_encrypted
         FROM users u
         WHERE u.email = $1 AND u.tenant_id = $2`,
        [normalizedEmail, tenantRow.id]
      );
      if (userRes.rows.length > 0) {
        userRow = userRes.rows[0];
      }
    } finally {
      client.release();
    }

    // 3. Verify Argon2id password hash strictly - NO plain-text bypasses
    let isPasswordValid = false;
    if (userRow && userRow.is_active && userRow.password_hash) {
      isPasswordValid = await AuthenticationService.verifyPassword(userRow.password_hash, password);
    }

    if (!userRow || !isPasswordValid) {
      const updatedRate = await AuthenticationService.recordFailedAttempt(rateLimitKey, pool);
      return NextResponse.json(
        {
          error: `Invalid credentials or organization not found. ${updatedRate.attemptsRemaining} attempt(s) remaining.`
        },
        { status: 401 }
      );
    }

    // 4. Success: Reset rate limit attempts
    await AuthenticationService.resetAttempts(rateLimitKey, pool);

    // 5. Look up default primary legal entity for tenant
    let entityId = userRow.tenant_id;
    try {
      const entityRes = await pool.query(
        'SELECT id FROM legal_entities WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1',
        [userRow.tenant_id]
      );
      if (entityRes.rows.length > 0) {
        entityId = entityRes.rows[0].id;
      }
    } catch {
      // Use tenant ID fallback if entities query empty
    }

    // 6. Issue temporary 2FA token with 5-minute expiration
    const tempTokenPayload = {
      userId: userRow.id,
      tenantId: userRow.tenant_id,
      entityId,
      role: userRow.role as UserRole,
      email: userRow.email,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000
    };

    const tempToken = AuthenticationService.signSessionToken(tempTokenPayload, jwtSecret);

    return NextResponse.json({
      requires2FA: userRow.is_2fa_enabled,
      tempToken,
      userId: userRow.id,
      name: userRow.full_name_en,
      email: userRow.email
    });
  } catch (error: any) {
    console.error('[Login Error]', error?.message || error);
    return NextResponse.json(
      { error: error?.message?.startsWith('CRITICAL_SECURITY_FAILURE') ? error.message : 'Internal authentication server error' },
      { status: 500 }
    );
  }
}
