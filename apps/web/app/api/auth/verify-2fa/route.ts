import { NextResponse } from 'next/server';
import { AuthenticationService, UserRole } from '@ledger-ae/shared-types';
import { getDatabasePool, getValidatedSecrets } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { jwtSecret, encryptionKey } = getValidatedSecrets();
    const body = await request.json();
    const { code, tempToken } = body;

    if (!code || !tempToken) {
      return NextResponse.json(
        { error: 'Verification code and temporary session token are required' },
        { status: 400 }
      );
    }

    // 1. Verify temporary 2FA session token signature & expiration
    const tempPayload = AuthenticationService.verifySessionToken(tempToken, jwtSecret);
    if (!tempPayload) {
      return NextResponse.json(
        { error: 'Invalid or expired 2FA verification session. Please log in again.' },
        { status: 401 }
      );
    }

    const pool = getDatabasePool();
    const client = await pool.connect();
    let userRow: any = null;
    let isTotpValid = false;
    let isRecoveryCodeValid = false;

    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tempPayload.tenantId]);
      const userRes = await client.query(
        `SELECT id, tenant_id, email, full_name_en, role, is_active,
                totp_secret_encrypted
         FROM users
         WHERE id = $1 AND tenant_id = $2`,
        [tempPayload.userId, tempPayload.tenantId]
      );

      if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
        await client.query('COMMIT');
        return NextResponse.json(
          { error: 'User account not found or deactivated.' },
          { status: 401 }
        );
      }
      userRow = userRes.rows[0];

      // 2. Real TOTP verification: Decrypt user's encrypted secret and verify with RFC 6238
      const cleanCode = typeof code === 'string' ? code.trim() : '';
      if (userRow.totp_secret_encrypted && cleanCode.length === 6 && /^\d+$/.test(cleanCode)) {
        try {
          const decryptedSecret = AuthenticationService.decryptSecret(
            userRow.totp_secret_encrypted,
            encryptionKey
          );
          isTotpValid = AuthenticationService.verifyTotp(cleanCode, decryptedSecret);
        } catch (decryptErr) {
          console.error('[2FA Decrypt Error]', decryptErr);
        }
      }

      // 3. One-time recovery code verification: Check hashed recovery codes in database
      if (!isTotpValid) {
        const codeHash = AuthenticationService.hashRecoveryCode(code);
        const recoveryRes = await client.query(
          `UPDATE user_recovery_codes
           SET used_at = NOW()
           WHERE user_id = $1 AND tenant_id = $2 AND code_hash = $3 AND used_at IS NULL
           RETURNING id`,
          [userRow.id, tempPayload.tenantId, codeHash]
        );
        if (recoveryRes.rows.length > 0) {
          isRecoveryCodeValid = true;
        }
      }

      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    // Strict validation: No hardcoded codes or unauthorized bypasses permitted
    if (!isTotpValid && !isRecoveryCodeValid) {
      return NextResponse.json(
        { error: 'Invalid verification code or recovery code already used.' },
        { status: 400 }
      );
    }

    // 4. Issue full authenticated session token
    const expiresAtMs = Date.now() + 8 * 60 * 60 * 1000; // 8 hours
    const fullSessionPayload = {
      userId: userRow.id,
      tenantId: userRow.tenant_id,
      entityId: tempPayload.entityId,
      role: userRow.role as UserRole,
      email: userRow.email,
      issuedAt: Date.now(),
      expiresAt: expiresAtMs
    };

    const sessionJwt = AuthenticationService.signSessionToken(fullSessionPayload, jwtSecret);

    // 5. Store active session in database sessions table for server-side revocation and rotation
    const sessionId = await AuthenticationService.createSession(pool, {
      tenantId: userRow.tenant_id,
      entityId: tempPayload.entityId,
      userId: userRow.id,
      role: userRow.role as UserRole,
      sessionToken: sessionJwt,
      expiresAt: new Date(expiresAtMs)
    });

    const response = NextResponse.json({
      success: true,
      sessionId,
      user: {
        id: userRow.id,
        name: userRow.full_name_en,
        role: userRow.role,
        email: userRow.email,
        tenantId: userRow.tenant_id
      }
    });

    // 6. Secure HttpOnly cookie
    response.cookies.set('ledger_session', sessionJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 28800, // 8 hours
      path: '/'
    });

    return response;
  } catch (error: any) {
    console.error('[2FA Verify Error]', error?.message || error);
    return NextResponse.json(
      { error: error?.message?.startsWith('CRITICAL_SECURITY_FAILURE') ? error.message : 'Verification failed' },
      { status: 500 }
    );
  }
}
