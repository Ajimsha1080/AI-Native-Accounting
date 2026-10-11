import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';

const intlMiddleware = createMiddleware({
  locales: ['en', 'ar'],
  defaultLocale: 'en',
  localePrefix: 'always'
});

/**
 * Edge-compatible HMAC-SHA256 session token verification using Web Crypto API
 */
async function verifySessionTokenEdge(token: string, secret: string): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [dataString, providedSignature] = parts;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuf = await crypto.subtle.sign('HMAC', key, enc.encode(dataString));
    const expectedBase64Url = btoa(String.fromCharCode(...new Uint8Array(signatureBuf)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    if (providedSignature !== expectedBase64Url) return false;

    // Decode payload
    const jsonStr = atob(dataString.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(jsonStr);
    return Boolean(payload && payload.expiresAt && Date.now() <= payload.expiresAt);
  } catch {
    return false;
  }
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. First run next-intl middleware for locale routing
  const response = intlMiddleware(request);

  // 2. Protect authenticated application routes (/[locale]/app/**)
  const isAppRoute = /^\/(en|ar)\/app(\/.*)?$/.test(pathname);

  if (isAppRoute) {
    const sessionCookie = request.cookies.get('ledger_session')?.value;
    const jwtSecret = process.env.JWT_SECRET;

    let isAuthenticated = false;

    // Cryptographic validation of session cookie (fails closed if secret missing or token invalid)
    if (sessionCookie && jwtSecret && jwtSecret.length >= 32) {
      isAuthenticated = await verifySessionTokenEdge(sessionCookie, jwtSecret);
    }

    if (!isAuthenticated) {
      // Determine locale for redirect
      const localeMatch = pathname.match(/^\/(en|ar)/);
      const locale = localeMatch ? localeMatch[1] : 'en';
      const loginUrl = new URL(`/${locale}/login`, request.url);
      loginUrl.searchParams.set('redirect', pathname);

      const redirectResponse = NextResponse.redirect(loginUrl);
      // Clear invalid session cookie
      if (sessionCookie) {
        redirectResponse.cookies.delete('ledger_session');
      }
      return redirectResponse;
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
