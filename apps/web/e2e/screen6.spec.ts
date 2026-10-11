import { test, expect } from '@playwright/test';
import { loginAndAuthenticate } from './auth-helper';

test.describe('Screen 6: Bank Reconciliation (Statement vs Ledger, Match, AI Explanations and Confidence)', () => {
  test('Inspect bank feed vs ledger, review AI match explanations, and accept match', async ({ page }) => {
    // 1. Authenticate to app using real RFC 6238 TOTP
    await loginAndAuthenticate(page);

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
