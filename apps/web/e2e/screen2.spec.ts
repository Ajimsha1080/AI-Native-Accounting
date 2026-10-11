import { test, expect } from '@playwright/test';
import { loginAndAuthenticate } from './auth-helper';

test.describe('Screen 2: Dashboard Real-time Metrics, Ageing, Close Status & AI Proposals', () => {
  test('Dashboard loads metrics dynamically, updates on entity switch, and displays integer minor units', async ({ page }) => {
    // 1. Authenticate through Screen 1 Login & 2FA using real RFC 6238 TOTP
    await loginAndAuthenticate(page);

    // 2. Land on Screen 2 Dashboard
    await page.waitForURL('**/en/app/dashboard');
    await expect(page.locator('h1')).toContainText(/Financial Command Dashboard/i);

    // 3. Verify Dynamic Cash Minor Units Formatted
    await expect(page.locator('text=AED 18,450,000.00')).toBeVisible();

    // 4. Verify AR and AP Ageing distribution grids
    await expect(page.locator('text=AR & AP Ageing Distribution')).toBeVisible();
    await expect(page.locator('text=AR (Receivables)')).toBeVisible();
    await expect(page.locator('text=AP (Payables)')).toBeVisible();

    // 5. Verify Close Status Checklist
    await expect(page.locator('text=8 of 12 close tasks verified')).toBeVisible();

    // 6. Verify Open AI Agent Proposals
    await expect(page.locator('text=Open AI Agent Proposals')).toBeVisible();
    await expect(page.locator('text=3 Pending Actions')).toBeVisible();
    await expect(page.locator('text=Auto-Match Emirates NBD Wire to Invoice INV-2026-0042')).toBeVisible();

    // 7. Verify Entity Switch triggers reactive recalculation
    const entitySelector = page.locator('select').nth(1);
    await entitySelector.selectOption('ent-mainland');

    // Mainland Cash is AED 8,450,000.00
    await expect(page.locator('text=AED 8,450,000.00')).toBeVisible();

    // 8. Verify Arabic RTL Layout
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/dashboard');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/لوحة القيادة/i);
    await expect(page.locator('text=السيولة والنقد')).toBeVisible();
  });
});
