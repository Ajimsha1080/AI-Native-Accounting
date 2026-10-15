import { test, expect } from '@playwright/test';
import { loginAndAuthenticate } from './auth-helper';

test.describe('Screen 5: VAT 201 Return View with Drill-down from Every Box to Source Entries', () => {
  test('Load VAT 201 return, inspect Boxes 1b & 9, open drill-down modal, and verify Arabic RTL', async ({ page }) => {
    // 1. Authenticate to app using real RFC 6238 TOTP
    await loginAndAuthenticate(page);

    // 2. Navigate to VAT 201 Return
    await page.goto('/en/app/tax/vat201');
    await expect(page.locator('h1')).toContainText(/VAT 201 Return/i);

    // 3. Verify Statutory Boxes Displayed
    await expect(page.locator('text=Box 1a')).toBeVisible();
    await expect(page.locator('text=Box 1b')).toBeVisible();
    await expect(page.locator('text=Box 9')).toBeVisible();
    await expect(page.locator('text=Box 14').first()).toBeVisible();

    // 4. Verify Net FTA Liability
    await expect(page.locator('text=AED 342,500.00').first()).toBeVisible();

    // 5. Open Drill-Down Modal on Box 1b (Dubai Sales)
    const inspectBtn1b = page.locator('tr:has-text("Box 1b") button:has-text("Inspect")');
    await expect(inspectBtn1b).toBeVisible();
    await inspectBtn1b.click();

    // Verify modal contents
    await expect(page.locator('text=Source Audit Lineage: 2 verified double-entry transactions')).toBeVisible();
    await expect(page.locator('text=Emaar Properties PJSC').first()).toBeVisible();
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
