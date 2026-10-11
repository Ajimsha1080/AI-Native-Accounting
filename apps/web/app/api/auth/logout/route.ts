import { NextResponse } from 'next/server';
import { AuthenticationService } from '@ledger-ae/shared-types';
import { getDatabasePool, getValidatedSecrets } from '@/lib/db';

export async function POST(request: Request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/ledger_session=([^;]+)/);
  const sessionToken = match ? match[1] : null;

  if (sessionToken) {
    try {
      const { jwtSecret } = getValidatedSecrets();
      const payload = AuthenticationService.verifySessionToken(sessionToken, jwtSecret);
      if (payload) {
        const pool = getDatabasePool();
        // Server-side session revocation in database sessions table
        await AuthenticationService.revokeSession(pool, payload.tenantId, sessionToken, 'USER_LOGOUT');
      }
    } catch {
      // Ignore database or secret errors on logout
    }
  }

  const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
  response.cookies.delete('ledger_session');
  return response;
}
