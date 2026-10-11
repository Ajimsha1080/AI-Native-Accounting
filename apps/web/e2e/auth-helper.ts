import { Page } from '@playwright/test';
import { generateSync } from 'otplib';

export const TEST_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

/**
 * Standard test helper to login and pass 2FA using real RFC 6238 TOTP against real Postgres
 */
export async function loginAndAuthenticate(
  page: Page,
  options: {
    locale?: 'en' | 'ar';
    email?: string;
    password?: string;
    tenantSlug?: string;
  } = {}
) {
  const {
    locale = 'en',
    email = 'accountant@alnoor.ae',
    password = 'Password@123',
    tenantSlug = 'al-noor-group'
  } = options;

  await page.goto(`/${locale}/login`);
  await page.fill('input[name="tenantSlug"]', tenantSlug);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  await page.waitForSelector('input[placeholder="123456"]');
  const validTotpCode = generateSync({ secret: TEST_TOTP_SECRET });
  await page.locator('input[placeholder="123456"]').fill(validTotpCode);
  await page.click('button[type="submit"]');

  await page.waitForURL(`**/${locale}/app/dashboard`);
}
