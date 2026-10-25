import { test, expect } from '@playwright/test';
import { loginAndAuthenticate } from './auth-helper';

test.describe('Screen 4: Invoices & Vendor Bills (List, Detail, PDF Preview en/ar, Approvals)', () => {
  test('Inspect invoices & bills list, select document, check bilingual preview, and approve pending bill', async ({ page }) => {
    // 1. Authenticate to app using real RFC 6238 TOTP
    await loginAndAuthenticate(page);

    // 2. Navigate to Invoicing & Bills
    await page.goto('/en/app/invoicing/sales');
    await expect(page.locator('h1')).toContainText(/Invoices & Vendor Bills/i);

    // 3. Verify Table Rows
    await expect(page.locator('text=INV-2026-0101').first()).toBeVisible();
    await expect(page.locator('text=Standard Customer').first()).toBeVisible();
    await expect(page.locator('text=AED 525,000.00').first()).toBeVisible();

    // 4. Verify Bilingual Document Preview
    await expect(page.locator('text=Official UAE Tax Document (en / ar)')).toBeVisible();
    await expect(page.locator('strong:has-text("Al-Noor Trading LLC")')).toBeVisible();
    await expect(page.locator('text=100456789012345').first()).toBeVisible();

    // 5. Filter by Vendor Bills
    await page.click('button:has-text("Vendor Bills")');
    await expect(page.locator('text=BILL-2026-5501')).toBeVisible();
    await expect(page.locator('text=BILL-2026-5502')).toBeVisible();

    // 6. Select Pending Bill and Approve
    await page.click('text=BILL-2026-5502');
    await expect(page.locator('text=Standard Vendor').first()).toBeVisible();
    await expect(page.locator('text=Approve & Clear')).toBeVisible();

    await page.click('button:has-text("Approve & Clear")');
    await expect(page.locator('text=Approval Stage:').locator('..')).toContainText('APPROVED');

    // 7. Test Arabic RTL view
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/invoicing/sales');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/الفواتير والمشتريات/i);
  });
});
