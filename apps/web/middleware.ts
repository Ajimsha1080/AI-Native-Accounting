import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { AuthenticationService } from '@ledger-ae/shared-types';

const intlMiddleware = createMiddleware({
  locales: ['en', 'ar'],
  defaultLocale: 'en',
  localePrefix: 'always'
});

export default function middleware(request: NextRequest) {
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
      try {
        const payload = AuthenticationService.verifySessionToken(sessionCookie, jwtSecret);
        if (payload && payload.expiresAt > Date.now()) {
          isAuthenticated = true;
        }
      } catch {
        isAuthenticated = false;
      }
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
