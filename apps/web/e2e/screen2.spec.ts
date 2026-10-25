import { test, expect } from '@playwright/test';
import { loginAndAuthenticate } from './auth-helper';

test.describe('Screen 2: Dashboard Real-time Metrics, Ageing, Close Status & AI Proposals', () => {
  test('Dashboard loads metrics dynamically, updates on entity switch, and displays integer minor units', async ({ page }) => {
    // 1. Authenticate through Screen 1 Login & 2FA using real RFC 6238 TOTP
    await loginAndAuthenticate(page);

    // 2. Land on Screen 2 Dashboard
    await page.waitForURL('**/en/app/dashboard');
    await expect(page.locator('h1')).toContainText(/Al-Noor Group/i);

    // 3. Verify Dynamic Cash Minor Units Formatted
    await expect(page.getByText(/AED 12,3[0-9]{2},[0-9]{3}\.00/).first()).toBeVisible();

    // 4. Verify AR and AP Ageing distribution grids
    await expect(page.locator('text=AR & AP Ageing Distribution')).toBeVisible();
    await expect(page.locator('text=AR (Receivables)')).toBeVisible();
    await expect(page.locator('text=AP (Payables)')).toBeVisible();

    // 5. Verify Close Status Checklist
    await expect(page.locator('text=Month-End Close Readiness')).toBeVisible();

    // 6. Verify Open AI Agent Proposals
    await expect(page.locator('text=Autonomous AI Financial Co-Pilot')).toBeVisible();
    await expect(page.locator('text=Claude 3.7 Sonnet')).toBeVisible();
    await expect(page.locator('text=Reverse Charge Tax Adjustment on AWS Cloud Services')).toBeVisible();

    // 7. Verify Entity Switch triggers reactive recalculation
    const entitySelector = page.locator('select').nth(1);
    await entitySelector.selectOption('ent-mainland');

    // Mainland active entity header verified
    await expect(page.locator('h1')).toContainText(/Al-Noor Trading LLC/i);

    // 8. Verify Arabic RTL Layout
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/dashboard');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/مجموعة النور/i);
    await expect(page.locator('text=السيولة والنقد')).toBeVisible();
  });
});
