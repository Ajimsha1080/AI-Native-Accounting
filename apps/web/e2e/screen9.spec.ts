import { test, expect } from '@playwright/test';

test.describe('Screen 9: Close Checklist, Audit Log Viewer, Settings & Roles', () => {
  test('Navigate to Close controls, inspect 12-step checklist, verify cryptographic audit trail, and check roles', async ({ page }) => {
    // 1. Authenticate to app
    await page.goto('/en/login');
    await page.fill('input[name="tenantSlug"]', 'al-noor-group');
    await page.fill('input[name="email"]', 'accountant@alnoor.ae');
    await page.fill('input[name="password"]', 'Password@123');
    await page.click('button[type="submit"]');

    await page.locator('input[placeholder="123456"]').fill('123456');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/en/app/dashboard');

    // 2. Navigate to Month-End Close & Controls
    await page.goto('/en/app/close');
    await expect(page.locator('h1')).toContainText(/Month-End Close, Audit Trail & Role Permissions/i);

    // 3. Verify Checklist items
    await expect(page.locator('text=Bank Statement Import & Feed Ingestion')).toBeVisible();
    await expect(page.locator('text=VAT 201 14-Box Return Finalization')).toBeVisible();
    await expect(page.locator('text=Cryptographic Audit Trail Hash Chain Verification')).toBeVisible();

    // 4. Switch to Cryptographic Audit Trail Tab
    await page.click('button:has-text("Cryptographic Audit Trail")');
    await expect(page.locator('text=Immutable Append-Only Audit Trail')).toBeVisible();
    await expect(page.locator('text=POST_JOURNAL_VOUCHER (JV-2026-0001)')).toBeVisible();
    await expect(page.locator('text=Cryptographic Chain Valid')).toBeVisible();

    // 5. Switch to Roles & Permissions Tab
    await page.click('button:has-text("Roles & Permissions Matrix")');
    await expect(page.locator('text=FINANCE_DIRECTOR')).toBeVisible();
    await expect(page.locator('text=CHIEF_ACCOUNTANT')).toBeVisible();
    await expect(page.locator('text=TAX_MANAGER')).toBeVisible();
    await expect(page.locator('text=EXTERNAL_AUDITOR')).toBeVisible();

    // 6. Test Arabic RTL view
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/close');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/إقفال الفترة، سجل التدقيق والأدوار/i);
  });
});
