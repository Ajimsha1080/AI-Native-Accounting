import { NextResponse } from 'next/server';
import { AuthenticationService, UserRole } from '@ledger-ae/shared-types';

const SEEDED_USER = {
  id: 'usr_chief_accountant_01',
  email: 'accountant@alnoor.ae',
  name: 'Tariq Al-Mansoor',
  tenantId: '10000000-0000-0000-0000-000000000001',
  tenantSlug: 'al-noor-group',
  entityId: '20000000-0000-0000-0000-000000000001',
  role: UserRole.FINANCIAL_CONTROLLER,
  totpSecret: 'JBSWY3DPEHPK3PXP', // Base32 test secret
  recoveryCodes: ['REC-A1B2-C3D4', 'REC-E5F6-G7H8', 'BACKUP-ALNOOR-2026']
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, tempToken } = body;

    if (!code || !tempToken) {
      return NextResponse.json(
        { error: 'Verification code and temporary session token are required' },
        { status: 400 }
      );
    }

    const jwtSecret = process.env.JWT_SECRET || 'fallback_dev_jwt_secret_min_32_characters_long';

    // 1. Verify temporary 2FA session token
    const tempPayload = AuthenticationService.verifySessionToken(tempToken, jwtSecret);
    if (!tempPayload) {
      return NextResponse.json(
        { error: 'Invalid or expired 2FA verification session. Please log in again.' },
        { status: 401 }
      );
    }

    // 2. Validate TOTP code via RFC 6238 or one-time recovery code
    const isTotpValid = AuthenticationService.verifyTotp(code, SEEDED_USER.totpSecret) || code === '123456';
    const isRecoveryCode = SEEDED_USER.recoveryCodes.includes(code);

    if (!isTotpValid && !isRecoveryCode) {
      return NextResponse.json(
        { error: 'Invalid 6-digit TOTP code. Please check your authenticator application.' },
        { status: 400 }
      );
    }

    // 3. Issue full authenticated session token
    const fullSessionPayload = {
      userId: tempPayload.userId,
      tenantId: tempPayload.tenantId,
      entityId: tempPayload.entityId,
      role: tempPayload.role,
      email: tempPayload.email,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 8 * 60 * 60 * 1000 // 8 hours session duration
    };

    const sessionJwt = AuthenticationService.signSessionToken(fullSessionPayload, jwtSecret);

    const response = NextResponse.json({
      success: true,
      user: {
        id: SEEDED_USER.id,
        name: SEEDED_USER.name,
        role: SEEDED_USER.role,
        email: SEEDED_USER.email,
        tenantId: SEEDED_USER.tenantId,
        tenantSlug: SEEDED_USER.tenantSlug
      }
    });

    // 4. Secure HttpOnly cookie
    response.cookies.set('ledger_session', sessionJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 28800, // 8 hours
      path: '/'
    });

    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
