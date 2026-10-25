import { test, expect } from '@playwright/test';
import { loginAndAuthenticate } from './auth-helper';

test.describe('Screen 7: AI Proposals Inbox (Approve/Reject, Source, Logic, and Cost)', () => {
  test('Inspect proposals, verify statutory basis and token telemetry, approve proposal, and verify Arabic RTL', async ({ page }) => {
    // 1. Authenticate to app using real RFC 6238 TOTP
    await loginAndAuthenticate(page);

    // 2. Navigate to AI Proposals Inbox
    await page.goto('/en/app/ai/proposals');
    await expect(page.locator('h1')).toContainText(/AI Proposals & Agent Governance Inbox/i);

    // 3. Verify Telemetry Header & Feed
    await expect(page.locator('text=Tokens Ingested')).toBeVisible();
    await expect(page.locator('text=Statutory Tax Classification').first()).toBeVisible();

    // Select the proposal to inspect its details
    await page.locator('text=Statutory Tax Classification').first().click();

    // 4. Verify Inspection Panel Details
    await expect(page.locator('text=UAE STATUTORY LEGAL BASIS & DECREE-LAW')).toBeVisible();
    await expect(page.locator('text=EXPLAINABLE REASONING & LOGIC')).toBeVisible();
    await expect(page.locator('text=PROPOSED DOUBLE-ENTRY JOURNAL VOUCHER')).toBeVisible();
    await expect(page.locator('text=AED 250.00').first()).toBeVisible();
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
