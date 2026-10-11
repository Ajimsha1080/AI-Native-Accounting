import { test, expect } from '@playwright/test';

test.describe('Screen 5: VAT 201 Return View with Drill-down from Every Box to Source Entries', () => {
  test('Load VAT 201 return, inspect Boxes 1b & 9, open drill-down modal, and verify Arabic RTL', async ({ page }) => {
    // 1. Authenticate to app
    await page.goto('/en/login');
    await page.fill('input[name="tenantSlug"]', 'al-noor-group');
    await page.fill('input[name="email"]', 'accountant@alnoor.ae');
    await page.fill('input[name="password"]', 'Password@123');
    await page.click('button[type="submit"]');

    await page.locator('input[placeholder="123456"]').fill('123456');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/en/app/dashboard');

    // 2. Navigate to VAT 201 Return
    await page.goto('/en/app/tax/vat201');
    await expect(page.locator('h1')).toContainText(/VAT 201 Return/i);

    // 3. Verify Statutory Boxes Displayed
    await expect(page.locator('text=Box 1a')).toBeVisible();
    await expect(page.locator('text=Box 1b')).toBeVisible();
    await expect(page.locator('text=Box 9')).toBeVisible();
    await expect(page.locator('text=Box 14')).toBeVisible();

    // 4. Verify Net FTA Liability
    await expect(page.locator('text=AED 342,500.00')).toBeVisible();

    // 5. Open Drill-Down Modal on Box 1b (Dubai Sales)
    const inspectBtn1b = page.locator('tr:has-text("Box 1b") button:has-text("Inspect")');
    await expect(inspectBtn1b).toBeVisible();
    await inspectBtn1b.click();

    // Verify modal contents
    await expect(page.locator('text=Source Audit Lineage: 2 verified double-entry transactions')).toBeVisible();
    await expect(page.locator('text=Emaar Properties PJSC')).toBeVisible();
    await expect(page.locator('text=AED 500,000.00')).toBeVisible();

    // Close modal
    await page.click('button:has-text("Close Drill-Down")');
    await expect(page.locator('text=Source Audit Lineage')).not.toBeVisible();

    // 6. Test Arabic RTL view
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/tax/vat201');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/إقرار ضريبة القيمة المضافة/i);
  });
});
