import { test, expect } from '@playwright/test';

test.describe('Screen 6: Bank Reconciliation (Statement vs Ledger, Match, AI Explanations and Confidence)', () => {
  test.beforeEach(async ({ request }) => {
    await request.get('/api/test/reset-mock-state');
  });

  test('Inspect bank feed vs ledger, review AI match explanations, and accept match', async ({ page }) => {
    // 1. Authenticate to app
    await page.goto('/en/login');
    await page.fill('input[name="tenantSlug"]', 'al-noor-group');
    await page.fill('input[name="email"]', 'accountant@alnoor.ae');
    await page.fill('input[name="password"]', 'Password@123');
    await page.click('button[type="submit"]');

    await page.locator('input[placeholder="123456"]').fill('123456');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/en/app/dashboard');

    // 2. Navigate to Bank Reconciliation
    await page.goto('/en/app/banking/reconciliation');
    await expect(page.locator('h1')).toContainText(/AI-Powered Bank Reconciliation/i);

    // 3. Verify Account Header Balances
    await expect(page.locator('text=Emirates NBD - Operating (AED)')).toBeVisible();
    await expect(page.locator('text=BANK STATEMENT BALANCE')).toBeVisible();
    await expect(page.locator('text=GENERAL LEDGER BALANCE')).toBeVisible();

    // 4. Verify AI Match Assistant Suggestions
    await expect(page.locator('text=AI Reconciliation Agent')).toBeVisible();
    await expect(page.locator('text=99% Match')).toBeVisible();
    await expect(page.locator('text=Al-Futtaim Group').first()).toBeVisible();

    // 5. Accept AI Match Suggestion
    const acceptBtn = page.locator('button:has-text("Accept & Match Entry")').first();
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    // 6. Test Arabic RTL view
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/banking/reconciliation');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/التسوية المصرفية الذكية/i);
  });
});
