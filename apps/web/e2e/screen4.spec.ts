import { test, expect } from '@playwright/test';

test.describe('Screen 4: Invoices & Vendor Bills (List, Detail, PDF Preview en/ar, Approvals)', () => {
  test('Inspect invoices & bills list, select document, check bilingual preview, and approve pending bill', async ({ page }) => {
    // 1. Authenticate to app
    await page.goto('/en/login');
    await page.fill('input[name="tenantSlug"]', 'al-noor-group');
    await page.fill('input[name="email"]', 'accountant@alnoor.ae');
    await page.fill('input[name="password"]', 'Password@123');
    await page.click('button[type="submit"]');

    await page.locator('input[placeholder="123456"]').fill('123456');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/en/app/dashboard');

    // 2. Navigate to Invoicing & Bills
    await page.goto('/en/app/invoicing/sales');
    await expect(page.locator('h1')).toContainText(/Invoices & Vendor Bills/i);

    // 3. Verify Table Rows
    await expect(page.locator('text=INV-2026-0101')).toBeVisible();
    await expect(page.locator('text=Emaar Properties PJSC')).toBeVisible();
    await expect(page.locator('text=AED 525,000.00')).toBeVisible();

    // 4. Verify Bilingual Document Preview
    await expect(page.locator('text=Official UAE Tax Document (en / ar)')).toBeVisible();
    await expect(page.locator('text=Al-Noor Trading LLC')).toBeVisible();
    await expect(page.locator('text=100456789012345')).toBeVisible();

    // 5. Filter by Vendor Bills
    await page.click('button:has-text("Vendor Bills")');
    await expect(page.locator('text=BILL-2026-5501')).toBeVisible();
    await expect(page.locator('text=BILL-2026-5502')).toBeVisible();

    // 6. Select Pending Bill and Approve
    await page.click('text=BILL-2026-5502');
    await expect(page.locator('text=Cisco Systems Gulf FZ-LLC')).toBeVisible();
    await expect(page.locator('text=Approve & Clear')).toBeVisible();

    await page.click('button:has-text("Approve & Clear")');
    await expect(page.locator('text=APPROVED_BY_AUTHORIZED_OFFICER')).toBeVisible();

    // 7. Test Arabic RTL view
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/invoicing/sales');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/الفواتير والمشتريات/i);
  });
});
