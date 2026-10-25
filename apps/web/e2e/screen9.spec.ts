import { test, expect } from '@playwright/test';
import { loginAndAuthenticate } from './auth-helper';

test.describe('Screen 9: Close Checklist, Audit Log Viewer, Settings & Roles', () => {
  test('Navigate to Close controls, inspect 12-step checklist, verify cryptographic audit trail, and check roles', async ({ page }) => {
    // 1. Authenticate to app using real RFC 6238 TOTP
    await loginAndAuthenticate(page);

    // 2. Navigate to Month-End Close & Controls
    await page.goto('/en/app/close');
    await expect(page.locator('h1')).toContainText(/Month-End Close, Audit Trail & Role Permissions/i);

    // 3. Verify Checklist items
    await expect(page.locator('text=Bank Feeds Reconciled')).toBeVisible();
    await expect(page.locator('text=VAT 201 Tax Return Reconciled')).toBeVisible();
    await expect(page.locator('text=Audit Trail Hash Chain Verified')).toBeVisible();

    // 4. Switch to Cryptographic Audit Trail Tab
    await page.click('button:has-text("Cryptographic Audit Trail")');
    await expect(page.locator('text=Immutable Append-Only Audit Trail')).toBeVisible();
    await expect(page.locator('text=VERIFY_TRIAL_BALANCE_HASH').first()).toBeVisible();
    await expect(page.locator('text=Cryptographic Chain Valid')).toBeVisible();

    // 5. Switch to Roles & Permissions Tab
    await page.click('button:has-text("Roles & Permissions Matrix")');
    await expect(page.locator('text=FINANCE_DIRECTOR')).toBeVisible();
    await expect(page.locator('text=CHIEF_ACCOUNTANT')).toBeVisible();
    await expect(page.locator('text=TAX_MANAGER')).toBeVisible();
    await expect(page.locator('text=SECURITY_AUDITOR')).toBeVisible();

    // 6. Test Arabic RTL view
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/close');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/إقفال الفترة، سجل التدقيق والأدوار/i);
  });
});
