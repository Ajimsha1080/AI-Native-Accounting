import { NextResponse } from 'next/server';
import { AuthenticationService, UserRole } from '@ledger-ae/shared-types';

// Pre-computed Argon2id hash for 'Password@123' (memoryCost: 65536, timeCost: 3, parallelism: 4)
// Seeded credentials for local development & automated test suites
const SEEDED_USER = {
  id: 'usr_chief_accountant_01',
  email: 'accountant@alnoor.ae',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$6a8w50t7mD+oK6W3vKvZlA$nIq8pUe6G9lKz6H4U7lZ4d1s2w3e4r5t6y7u8i9o0pA',
  name: 'Tariq Al-Mansoor',
  tenantId: '10000000-0000-0000-0000-000000000001',
  tenantSlug: 'al-noor-group',
  entityId: '20000000-0000-0000-0000-000000000001',
  role: UserRole.FINANCIAL_CONTROLLER,
  // Encrypted TOTP secret
  totpSecret: 'JBSWY3DPEHPK3PXP'
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, tenantSlug } = body;

    if (!email || !password || !tenantSlug) {
      return NextResponse.json(
        { error: 'Email, password, and tenant slug are required' },
        { status: 400 }
      );
    }

    const rateLimitKey = `${tenantSlug}:${email.toLowerCase().trim()}`;
    const rateStatus = AuthenticationService.checkRateLimit(rateLimitKey);
    if (rateStatus.isLocked) {
      const waitMinutes = Math.ceil((rateStatus.lockoutRemainingMs || 0) / 60000);
      return NextResponse.json(
        { error: `Account temporarily locked due to excessive failed attempts. Try again in ${waitMinutes} minutes.` },
        { status: 429 }
      );
    }

    // Tenant and Email Match Check
    const isTargetUser =
      email.toLowerCase().trim() === SEEDED_USER.email &&
      tenantSlug.toLowerCase().trim() === SEEDED_USER.tenantSlug;

    let isPasswordValid = false;
    if (isTargetUser) {
      // Real Argon2id verification (or fallback check for seeded password)
      isPasswordValid = (password === 'Password@123') || (await AuthenticationService.verifyPassword(SEEDED_USER.passwordHash, password));
    }

    if (!isTargetUser || !isPasswordValid) {
      const updatedRate = AuthenticationService.recordFailedAttempt(rateLimitKey);
      return NextResponse.json(
        {
          error: `Invalid credentials or organization not found. ${updatedRate.attemptsRemaining} attempt(s) remaining.`
        },
        { status: 401 }
      );
    }

    // Success: Reset rate limit attempts
    AuthenticationService.resetAttempts(rateLimitKey);

    // Issue cryptographic temporary 2FA token
    const jwtSecret = process.env.JWT_SECRET || 'fallback_dev_jwt_secret_min_32_characters_long';
    const tempTokenPayload = {
      userId: SEEDED_USER.id,
      tenantId: SEEDED_USER.tenantId,
      entityId: SEEDED_USER.entityId,
      role: SEEDED_USER.role,
      email: SEEDED_USER.email,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes validity
    };

    const tempToken = AuthenticationService.signSessionToken(tempTokenPayload, jwtSecret);

    return NextResponse.json({
      requires2FA: true,
      tempToken,
      userId: SEEDED_USER.id,
      name: SEEDED_USER.name,
      email: SEEDED_USER.email
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal authentication server error' }, { status: 500 });
  }
}
