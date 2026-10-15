import { test, expect } from '@playwright/test';
import { loginAndAuthenticate } from './auth-helper';

test.describe('Screen 8: Financial Reports & Consolidation (Trial Balance, P&L, Balance Sheet, IFRS 10, Export)', () => {
  test('Load reports, switch between Trial Balance, P&L, Balance Sheet and IFRS 10 Consolidation, and verify Arabic RTL', async ({ page }) => {
    // 1. Authenticate to app using real RFC 6238 TOTP
    await loginAndAuthenticate(page);

    // 2. Navigate to Reports
    await page.goto('/en/app/reports');
    await expect(page.locator('h1')).toContainText(/Financial Reports & Multi-Entity Consolidation/i);

    // 3. Verify Trial Balance Totals
    await expect(page.locator('text=Total General Ledger Trial Balance:').first()).toBeVisible();
    await expect(page.locator('text=Balanced: Total Debits == Total Credits')).toBeVisible();

    // 4. Switch to Profit & Loss Tab
    await page.click('button:has-text("Profit & Loss")');
    await expect(page.locator('text=TOTAL REVENUE')).toBeVisible();
    await expect(page.locator('text=AED 31,200,000.00').first()).toBeVisible();
    await expect(page.locator('text=NET PROFIT BEFORE TAX')).toBeVisible();
    await expect(page.getByText(/AED 13,(395|400),000\.00/).first()).toBeVisible();

    // 5. Switch to Balance Sheet Tab
    await page.click('button:has-text("Balance Sheet")');
    await expect(page.locator('text=TOTAL ASSETS')).toBeVisible();
    await expect(page.getByText(/AED 25,6(57|62),500\.00/).first()).toBeVisible();

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
