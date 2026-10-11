import { test, expect } from '@playwright/test';

test.describe('Screen 8: Financial Reports & Consolidation (Trial Balance, P&L, Balance Sheet, IFRS 10, Export)', () => {
  test('Load reports, switch between Trial Balance, P&L, Balance Sheet and IFRS 10 Consolidation, and verify Arabic RTL', async ({ page }) => {
    // 1. Authenticate to app
    await page.goto('/en/login');
    await page.fill('input[name="tenantSlug"]', 'al-noor-group');
    await page.fill('input[name="email"]', 'accountant@alnoor.ae');
    await page.fill('input[name="password"]', 'Password@123');
    await page.click('button[type="submit"]');

    await page.locator('input[placeholder="123456"]').fill('123456');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/en/app/dashboard');

    // 2. Navigate to Reports
    await page.goto('/en/app/reports');
    await expect(page.locator('h1')).toContainText(/Financial Reports & Multi-Entity Consolidation/i);

    // 3. Verify Trial Balance Totals
    await expect(page.locator('text=AED 97,880,200.00').first()).toBeVisible();
    await expect(page.locator('text=Balanced: Total Debits == Total Credits')).toBeVisible();

    // 4. Switch to Profit & Loss Tab
    await page.click('button:has-text("Profit & Loss")');
    await expect(page.locator('text=TOTAL REVENUE')).toBeVisible();
    await expect(page.locator('text=AED 31,200,000.00')).toBeVisible();
    await expect(page.locator('text=NET PROFIT BEFORE TAX')).toBeVisible();
    await expect(page.locator('text=AED 13,400,000.00')).toBeVisible();

    // 5. Switch to Balance Sheet Tab
    await page.click('button:has-text("Balance Sheet")');
    await expect(page.locator('text=TOTAL ASSETS')).toBeVisible();
    await expect(page.locator('text=AED 25,662,500.00').first()).toBeVisible();

    // 6. Switch to IFRS 10 Consolidation Tab
    await page.click('button:has-text("IFRS 10 Consolidation")');
    await expect(page.locator('text=IFRS 10 Consolidated Financial Statements')).toBeVisible();
    await expect(page.locator('text=INTERCOMPANY ELIMINATIONS')).toBeVisible();
    await expect(page.locator('text=Al-Noor Trading LLC (Mainland)')).toBeVisible();

    // 7. Verify Arabic RTL view
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/reports');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/التقارير المالية الموحدة/i);
  });
});
