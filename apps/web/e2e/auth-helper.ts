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
  await page.locator('input[name="tenantSlug"]').clear();
  await page.locator('input[name="tenantSlug"]').fill(tenantSlug);
  await page.locator('input[name="email"]').clear();
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').clear();
  await page.locator('input[name="password"]').fill(password);
  await page.click('button[type="submit"]');

  await page.waitForSelector('input[placeholder="123456"]');
  const validTotpCode = generateSync({ secret: TEST_TOTP_SECRET });
  await page.locator('input[placeholder="123456"]').fill(validTotpCode);
  await page.click('button[type="submit"]');

  await page.waitForURL(`**/${locale}/app/dashboard`);
}
