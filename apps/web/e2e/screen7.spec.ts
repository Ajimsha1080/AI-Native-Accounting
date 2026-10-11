import { test, expect } from '@playwright/test';

test.describe('Screen 7: AI Proposals Inbox (Approve/Reject, Source, Logic, and Cost)', () => {
  test.beforeEach(async ({ request }) => {
    await request.get('/api/test/reset-mock-state');
  });

  test('Inspect proposals, verify statutory basis and token telemetry, approve proposal, and verify Arabic RTL', async ({ page }) => {
    // 1. Authenticate to app
    await page.goto('/en/login');
    await page.fill('input[name="tenantSlug"]', 'al-noor-group');
    await page.fill('input[name="email"]', 'accountant@alnoor.ae');
    await page.fill('input[name="password"]', 'Password@123');
    await page.click('button[type="submit"]');

    await page.locator('input[placeholder="123456"]').fill('123456');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/en/app/dashboard');

    // 2. Navigate to AI Proposals Inbox
    await page.goto('/en/app/ai/proposals');
    await expect(page.locator('h1')).toContainText(/AI Proposals & Agent Governance Inbox/i);

    // 3. Verify Telemetry Header & Feed
    await expect(page.locator('text=Tokens Ingested')).toBeVisible();
    await expect(page.locator('text=Auto-Match Emirates NBD Inward Wire').first()).toBeVisible();
    await expect(page.locator('text=98%').first()).toBeVisible();

    // 4. Verify Inspection Panel Details
    await expect(page.locator('text=UAE STATUTORY LEGAL BASIS & DECREE-LAW')).toBeVisible();
    await expect(page.locator('text=EXPLAINABLE REASONING & LOGIC')).toBeVisible();
    await expect(page.locator('text=PROPOSED DOUBLE-ENTRY JOURNAL VOUCHER')).toBeVisible();
    await expect(page.locator('text=AED 142,500.00').first()).toBeVisible();
    await expect(page.locator('text=Latency:')).toBeVisible();

    // 5. Approve Proposal
    const approveBtn = page.locator('button:has-text("Approve & Commit Action")');
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    await expect(page.locator('text=Proposal has been APPROVED by Chief Accountant.')).toBeVisible();

    // 6. Test Arabic RTL view
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/ai/proposals');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/صندوق مقترحات الذكاء الاصطناعي/i);
  });
});
