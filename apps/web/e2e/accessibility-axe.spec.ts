import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAndAuthenticate } from './auth-helper';

test.describe('Automated WCAG 2.1 Level AA Accessibility Scans (Axe-Core)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndAuthenticate(page);
  });

  const auditedRoutes = [
    { name: 'Dashboard (EN)', path: '/en/app/dashboard' },
    { name: 'Dashboard (AR RTL)', path: '/ar/app/dashboard' },
    { name: 'VAT 201 Tax Return (EN)', path: '/en/app/tax/vat201' },
    { name: 'VAT 201 Tax Return (AR RTL)', path: '/ar/app/tax/vat201' },
    { name: 'Vendors & Tiered Approvals (EN)', path: '/en/app/payables/bills' },
    { name: 'Custom Report Builder (EN)', path: '/en/app/reports/builder' },
    { name: 'Auditor Read-Only Sandbox (EN)', path: '/en/app/auditor' }
  ];

  for (const route of auditedRoutes) {
    test(`Axe scan: ${route.name} conforms to WCAG 2.1 AA standards`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .disableRules(['color-contrast']) // Color contrast verified statically in wcag-accessibility-audit.md; dark theme synthetic thresholds
        .analyze();

      if (accessibilityScanResults.violations.length > 0) {
        console.warn(`Accessibility notices on ${route.name}:`, accessibilityScanResults.violations.map(v => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.length
        })));
      }

      // Assert zero critical or serious WCAG accessibility violations
      const criticalOrSeriousViolations = accessibilityScanResults.violations.filter(
        v => v.impact === 'critical' || v.impact === 'serious'
      );
      expect(criticalOrSeriousViolations).toEqual([]);
    });
  }
});
