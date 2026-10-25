import { test, expect } from '@playwright/test';
import { loginAndAuthenticate } from './auth-helper';

test.describe('Phase 5 Feature Completion Suite: Enterprise Modules (EN & AR)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndAuthenticate(page);
  });

  test('Module 1: Vendors and Bills with Approvals Workflow (EN & AR)', async ({ page }) => {
    // 1. Navigate to Bills in English
    await page.goto('/en/app/payables/bills');
    await expect(page.locator('h1')).toContainText(/Vendor Bills & Tiered Approvals/i);

    // 2. Verify seeded bills are rendered
    await expect(page.locator('text=BILL-2026-5501')).toBeVisible();
    await expect(page.locator('text=BILL-2026-5502')).toBeVisible();

    // 3. Action Tier 1 bill approval for BILL-2026-5503
    const approveBtn = page.locator('tr:has-text("BILL-2026-5503") button:has-text("Approve")').first();
    if (await approveBtn.isVisible()) {
      await approveBtn.click();
      await expect(page.locator('text=APPROVED').first()).toBeVisible();
    }

    // 4. Verify Arabic RTL View
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/payables/bills');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/فواتير الموردين والاعتمادات المالية/i);
  });

  test('Module 2: Customers and Payments Workbench (EN & AR)', async ({ page }) => {
    // 1. Navigate to Payments in English
    await page.goto('/en/app/receivables/payments');
    await expect(page.locator('h1')).toContainText(/Customers & Payment Allocations/i);

    // 2. Verify payment allocations
    await expect(page.locator('text=PAY-2026-0001')).toBeVisible();
    await expect(page.locator('text=INBOUND_CUSTOMER').first()).toBeVisible();

    // 3. Verify Arabic RTL View
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/receivables/payments');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/العملاء وتسويات المقبوضات/i);
  });

  test('Module 3: Fixed Assets Register & IFRS 16 Leases (EN & AR)', async ({ page }) => {
    // 1. Navigate to Assets in English
    await page.goto('/en/app/assets');
    await expect(page.locator('h1')).toContainText(/Fixed Assets & IFRS 16 Leases/i);

    // 2. Verify Fixed Assets and IFRS 16 Leases
    await expect(page.locator('text=AST-2026-001')).toBeVisible();
    await expect(page.locator('text=IFRS16-2026-HQ')).toBeVisible();

    // 3. Post monthly depreciation to GL
    const postDepBtn = page.locator('button:has-text("Post Depreciation")').first();
    await postDepBtn.click();
    await expect(page.locator('text=Depreciation posted successfully to GL')).toBeVisible();

    // 4. Switch to Arabic RTL
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/assets');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/الأصول الثابتة وعقود الإيجار/i);
  });

  test('Module 4: Payroll & Central Bank WPS SIF Dispatcher (EN & AR)', async ({ page }) => {
    // 1. Navigate to Payroll in English
    await page.goto('/en/app/payroll');
    await expect(page.locator('h1')).toContainText(/Payroll & Wages Protection System/i);

    // 2. Verify employee records & EOSG
    await expect(page.locator('text=Tariq Al-Mansoor')).toBeVisible();
    await expect(page.locator('text=Fatima Al-Zahra')).toBeVisible();

    // 3. Disburse payroll batch
    const disburseBtn = page.locator('button:has-text("Disburse & Post GL")').first();
    if (await disburseBtn.isVisible()) {
      await disburseBtn.click();
      await expect(page.locator('text=DISBURSED').first()).toBeVisible();
    }

    // 4. Switch to Arabic RTL
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/payroll');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/الرواتب ونظام حماية الأجور/i);
  });

  test('Module 5: E-Invoicing Queue & DLQ Retry Management (EN & AR)', async ({ page }) => {
    // 1. Navigate to E-Invoicing Queue
    await page.goto('/en/app/einvoicing');
    await expect(page.locator('h1')).toContainText(/E-Invoicing Transmission & Failure Queue/i);

    // 2. Switch to Arabic RTL
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/einvoicing');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/طابور الفوترة الإلكترونية ومعالجة الأخطاء/i);
  });

  test('Module 6: Custom Report Builder & CSV Export (EN & AR)', async ({ page }) => {
    // 1. Navigate to Report Builder
    await page.goto('/en/app/reports/builder');
    await expect(page.locator('h1')).toContainText(/Custom Report Builder/i);
    await expect(page.locator('text=Balanced: 0 fils variance')).toBeVisible();

    // 2. Filter by Asset category
    await page.selectOption('main select', 'ASSET');
    await expect(page.locator('text=Emirates NBD - Operating (AED)')).toBeVisible();

    // 3. Switch to Arabic RTL
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/reports/builder');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/منشئ التقارير المالية المخصص/i);
  });

  test('Module 7: Audit Log Viewer & Role Management (EN & AR)', async ({ page }) => {
    // 1. Navigate to Audit & Roles
    await page.goto('/en/app/audit');
    await expect(page.locator('h1')).toContainText(/Security Audit Trail & User Roles/i);

    // 2. Verify active user and audit stream
    await expect(page.locator('text=accountant@alnoor.ae').first()).toBeVisible();
    await expect(page.locator('text=FINANCE_DIRECTOR').first()).toBeVisible();

    // 3. Switch to Arabic RTL
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/audit');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/سجل التدقيق الأمني وإدارة الأدوار/i);
  });

  test('Module 8: Onboarding Migration Wizard (Zoho / QuickBooks / Tally) (EN & AR)', async ({ page }) => {
    // 1. Navigate to Onboarding
    await page.goto('/en/app/onboarding');
    await expect(page.locator('h1')).toContainText(/Data Migration & Onboarding Wizard/i);

    // 2. Trigger Zoho Books Import
    await page.click('button:has-text("Import from Zoho Books")');
    await expect(page.locator('text=Successfully ingested accounts from ZOHO')).toBeVisible();

    // 3. Switch to Arabic RTL
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/onboarding');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/معالج الترحيل واستيراد البيانات/i);
  });

  test('Module 9: Auditor Read-Only Workspace & FAF File (EN & AR)', async ({ page }) => {
    // 1. Navigate to Auditor Workspace
    await page.goto('/en/app/auditor');
    await expect(page.locator('h1')).toContainText(/Independent Audit & Assurance Workspace/i);
    await expect(page.locator('text=FAF v1.0.0')).toBeVisible();

    // 2. Switch to Arabic RTL
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/auditor');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/مساحة عمل مراجعة الحسابات والامتثال الضريبي/i);
  });

  test('Module 10: Platform Ops Console & Metering Telemetry (EN & AR)', async ({ page }) => {
    // 1. Navigate to Ops Console
    await page.goto('/en/app/ops');
    await expect(page.locator('h1')).toContainText(/Internal Ops Console & Tenant Governance/i);
    await expect(page.locator('text=ENTERPRISE')).toBeVisible();

    // 2. Switch to Arabic RTL
    const langBtn = page.locator('a[aria-label="التحويل إلى العربية"]');
    await langBtn.click();
    await page.waitForURL('**/ar/app/ops');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toContainText(/لوحة عمليات المنصة وإدارة الاشتراكات/i);
  });
});
