import { test, expect } from '@playwright/test';
import { loginAndAuthenticate } from './auth-helper';

test.describe('Screen 3: Chart of Accounts & Journal Entries (Draft, Validate, Post, Reverse)', () => {
  test('Navigate to COA, verify TanStack grid, create and post balanced journal, and reverse entry', async ({ page }) => {
    // 1. Authenticate to app using real RFC 6238 TOTP
    await loginAndAuthenticate(page);

    // 2. Navigate to Chart of Accounts
    await page.goto('/en/app/ledger/accounts');
    await expect(page.locator('h1')).toContainText(/Chart of Accounts/i);

    // Verify COA table contents
    await expect(page.locator('text=1020')).toBeVisible();
    await expect(page.locator('text=Emirates NBD - Operating (AED)')).toBeVisible();
    await expect(page.locator('text=AED 12,400,000.00')).toBeVisible();

    // 3. Navigate to Journal Vouchers
    await page.goto('/en/app/ledger/journals?new=true');
    await expect(page.locator('h1')).toContainText(/General Journal Vouchers/i);

    // Form should be open
    await expect(page.locator('text=Double-Entry Journal Voucher Editor')).toBeVisible();
    await expect(page.locator('text=Balanced (0 fils variance)')).toBeVisible();

    // 4. Validate Invariant button test
    await page.click('button:has-text("Validate Invariant")');
    await expect(page.locator('text=Double-entry invariant verified: 0 fils variance.')).toBeVisible();

    // 5. Post to Ledger
    await page.click('button:has-text("Post to Ledger")');
    await expect(page.locator('text=successfully posted to General Ledger!')).toBeVisible();

    // 6. Reverse a posted journal
    const reverseBtn = page.locator('button:has-text("Reverse")').first();
    await expect(reverseBtn).toBeVisible();

    page.on('dialog', (dialog) => dialog.accept());
    await reverseBtn.click();

    // 7. Test Arabic RTL view
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/ledger/journals');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/قيود اليومية العامة/i);
  });
});
