import { test, expect } from '@playwright/test';
import { generateSync } from 'otplib';
import { TEST_TOTP_SECRET } from './auth-helper';

test.describe('Screen 1: Authentication, 2FA, App Shell, Entity Switcher & RTL', () => {
  test('Login, 2FA challenge, Dashboard redirection and entity context switching', async ({ page }) => {
    // 1. Visit English login page
    await page.goto('/en/login');
    await expect(page).toHaveTitle(/LedgerAE/i);

    // 2. Fill login credentials
    await page.locator('input[name="tenantSlug"]').clear();
    await page.locator('input[name="tenantSlug"]').fill('al-noor-group');
    await page.locator('input[name="email"]').clear();
    await page.locator('input[name="email"]').fill('accountant@alnoor.ae');
    await page.locator('input[name="password"]').clear();
    await page.locator('input[name="password"]').fill('Password@123');

    // Submit credentials
    await page.click('button[type="submit"]');

    // 3. Verify step transitions to 2FA challenge
    await expect(page.locator('text=Two-Factor Authentication')).toBeVisible();

    // 4. Enter valid 6-digit TOTP code
    const totpInput = page.locator('input[placeholder="123456"]');
    await expect(totpInput).toBeVisible();
    const totpCode = generateSync({ secret: TEST_TOTP_SECRET });
    await totpInput.fill(totpCode);

    // Submit 2FA
    await page.click('button[type="submit"]');

    // 5. Verify redirection to Dashboard
    await page.waitForURL('**/en/app/dashboard');
    await expect(page.locator('h1')).toContainText(/Al-Noor Group/i);

    // 6. Verify Zero-Float Minor Units Display
    await expect(page.getByText(/AED 12,3[0-9]{2},[0-9]{3}\.00/).first()).toBeVisible();

    // 7. Verify Entity Switcher Changes Active Entity
    const entitySelector = page.locator('select').nth(1);
    await expect(entitySelector).toBeVisible();
    await entitySelector.selectOption('ent-mainland');
    await expect(page.locator('aside').getByText('Al-Noor Trading LLC (Dubai Mainland)')).toBeVisible();

    // 8. Verify Language Switch to Arabic toggles RTL and Arabic Typography
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/dashboard');

    const htmlElement = page.locator('html');
    await expect(htmlElement).toHaveAttribute('dir', 'rtl');
    await expect(htmlElement).toHaveAttribute('lang', 'ar');
    await expect(page.locator('h1')).toContainText(/مجموعة النور/i);
  });
});
