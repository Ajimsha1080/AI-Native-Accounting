async function testAll() {
  console.log('Testing authentication via Next.js proxy on port 3005...');
  const loginRes = await fetch('http://localhost:3005/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'ajimshaptm16@gmail.com',
      password: 'Password@123',
      tenantSlug: 'al-noor-group'
    })
  });

  if (loginRes.status !== 200) {
    console.error('Login failed:', loginRes.status, await loginRes.text());
    process.exit(1);
  }

  const rawCookie = loginRes.headers.get('set-cookie');
  if (!rawCookie) {
    console.error('No set-cookie header received');
    process.exit(1);
  }
  const cookie = rawCookie.split(';')[0];
  console.log('Login succeeded. Cookie:', cookie.substring(0, 30) + '...');

  const headers = { 'Cookie': cookie };

  const endpoints = [
    { name: 'Dashboard Page (SSR)', url: 'http://localhost:3005/en/app/dashboard' },
    { name: 'Chart of Accounts Page (SSR)', url: 'http://localhost:3005/en/app/ledger/accounts' },
    { name: 'Journal Vouchers Page (SSR)', url: 'http://localhost:3005/en/app/ledger/journals' },
    { name: 'VAT 201 Return Page (SSR)', url: 'http://localhost:3005/en/app/tax/vat201' },
    { name: 'Month-End Close Page (SSR)', url: 'http://localhost:3005/en/app/close' },
    { name: 'Bank Reconciliation Page (SSR)', url: 'http://localhost:3005/en/app/banking/reconciliation' },
    { name: 'Financial Reports Page (SSR)', url: 'http://localhost:3005/en/app/reports' },
    { name: 'Sales Invoices Page (SSR)', url: 'http://localhost:3005/en/app/invoicing/sales' },
    { name: 'Vendor Bills Page (SSR)', url: 'http://localhost:3005/en/app/payables/bills' },
    { name: 'Customer Payments Page (SSR)', url: 'http://localhost:3005/en/app/receivables/payments' },
    { name: 'WPS Payroll Page (SSR)', url: 'http://localhost:3005/en/app/payroll' },
    { name: 'Fixed Assets Page (SSR)', url: 'http://localhost:3005/en/app/assets' },
    { name: 'AI Proposals Page (SSR)', url: 'http://localhost:3005/en/app/ai/proposals' },
    { name: 'E-Invoicing Queue Page (SSR)', url: 'http://localhost:3005/en/app/einvoicing' },
    { name: 'Onboarding Page (SSR)', url: 'http://localhost:3005/en/app/onboarding' },
    { name: 'Auditor Workspace Page (SSR)', url: 'http://localhost:3005/en/app/auditor' },
    { name: 'Ops Console Page (SSR)', url: 'http://localhost:3005/en/app/ops' },
    { name: 'Audit & Roles Page (SSR)', url: 'http://localhost:3005/en/app/audit' },
    { name: 'API - Dashboard Metrics', url: 'http://localhost:3005/api/dashboard/metrics' },
    { name: 'API - Ledger Accounts', url: 'http://localhost:3005/api/ledger/accounts' },
    { name: 'API - Ledger Journals', url: 'http://localhost:3005/api/ledger/journals' },
    { name: 'API - VAT 201 Tax', url: 'http://localhost:3005/api/tax/vat201' },
    { name: 'API - Month-End Close', url: 'http://localhost:3005/api/close' },
    { name: 'API - Bank Reconciliation', url: 'http://localhost:3005/api/banking/reconciliation' },
    { name: 'API - Financial Reports', url: 'http://localhost:3005/api/reports' },
    { name: 'API - Sales Invoices', url: 'http://localhost:3005/api/invoicing' },
    { name: 'API - Vendor Bills', url: 'http://localhost:3005/api/vendors/bills' },
    { name: 'API - Customer Payments', url: 'http://localhost:3005/api/customers/payments' },
    { name: 'API - WPS Payroll', url: 'http://localhost:3005/api/payroll/wps' },
    { name: 'API - Fixed Assets', url: 'http://localhost:3005/api/assets/fixed' },
    { name: 'API - IFRS Revenue & Leases', url: 'http://localhost:3005/api/ifrs/revenue-leases' },
    { name: 'API - AI Proposals', url: 'http://localhost:3005/api/ai/proposals' },
    { name: 'API - E-Invoicing Queue', url: 'http://localhost:3005/api/einvoicing/queue' },
    { name: 'API - Onboarding Imports', url: 'http://localhost:3005/api/onboarding/import' },
    { name: 'API - Auditor Workspace', url: 'http://localhost:3005/api/auditor/workspace' },
    { name: 'API - Ops Console', url: 'http://localhost:3005/api/ops/console' },
    { name: 'API - Audit Roles', url: 'http://localhost:3005/api/settings/audit-roles' }
  ];

  let passed = 0;
  let failed = 0;

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, { headers, redirect: 'manual' });
      if (res.status === 200) {
        console.log(`[PASS] ${ep.name} -> HTTP 200`);
        passed++;
      } else if (res.status >= 300 && res.status < 400) {
        console.warn(`[REDIRECT ${res.status}] ${ep.name} -> Location: ${res.headers.get('location')}`);
        failed++;
      } else {
        console.error(`[FAIL ${res.status}] ${ep.name}`);
        failed++;
      }
    } catch (err) {
      console.error(`[EXCEPTION] ${ep.name}:`, err.message);
      failed++;
    }
  }

  console.log(`\n========================================`);
  console.log(`TOTAL TESTS: ${endpoints.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`========================================`);
  
  if (failed > 0) process.exit(1);
}

testAll();
