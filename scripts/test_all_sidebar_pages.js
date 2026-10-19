const http = require('http');

async function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3005,
      path,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function run() {
  console.log('1. Logging in to obtain session cookie...');
  const loginPayload = JSON.stringify({
    email: 'ajimshaptm16@gmail.com',
    password: 'Password@123',
    tenantSlug: 'al-noor-group'
  });

  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginPayload)
    },
    body: loginPayload
  });

  console.log('Login status:', loginRes.status);
  const setCookie = loginRes.headers['set-cookie'];
  let cookieHeader = '';
  if (setCookie) {
    cookieHeader = Array.isArray(setCookie) ? setCookie.map(c => c.split(';')[0]).join('; ') : setCookie.split(';')[0];
    console.log('Session Cookie acquired:', cookieHeader.substring(0, 40) + '...');
  } else {
    console.error('No set-cookie returned!', loginRes.body);
    process.exit(1);
  }

  const routes = [
    '/en/app/dashboard',
    '/en/app/ledger/accounts',
    '/en/app/ledger/journals',
    '/en/app/invoicing/sales',
    '/en/app/payables/bills',
    '/en/app/receivables/payments',
    '/en/app/tax/vat201',
    '/en/app/banking/reconciliation',
    '/en/app/ai/proposals',
    '/en/app/assets',
    '/en/app/payroll',
    '/en/app/einvoicing',
    '/en/app/reports',
    '/en/app/reports/builder',
    '/en/app/close',
    '/en/app/audit',
    '/en/app/onboarding',
    '/en/app/auditor',
    '/en/app/ops'
  ];

  console.log('\n2. Testing all 19 SSR Application Routes with session cookie...');
  for (const r of routes) {
    try {
      const pageRes = await request(r, {
        headers: { Cookie: cookieHeader }
      });
      const hasError = pageRes.body.includes('Error') || pageRes.body.includes('Cannot convert') || pageRes.status >= 400;
      console.log(`${pageRes.status === 200 ? '✅' : '❌'} [${pageRes.status}] ${r} ${hasError && pageRes.status === 200 ? '(WARNING: may contain error text)' : ''}`);
    } catch (e) {
      console.log(`❌ [FAIL] ${r}: ${e.message}`);
    }
  }

  const endpoints = [
    '/api/dashboard/metrics',
    '/api/ledger/accounts',
    '/api/ledger/journals',
    '/api/invoicing',
    '/api/vendors/bills',
    '/api/customers/payments',
    '/api/tax/vat201',
    '/api/banking/reconciliation',
    '/api/ai/proposals',
    '/api/assets/fixed',
    '/api/ifrs/revenue-leases',
    '/api/payroll/wps',
    '/api/einvoicing/queue',
    '/api/reports?type=trial-balance',
    '/api/reports/builder',
    '/api/close',
    '/api/settings/audit-roles?limit=50',
    '/api/auditor/workspace',
    '/api/onboarding/import',
    '/api/ops/console'
  ];

  console.log('\n3. Testing all API Endpoints with session cookie...');
  for (const ep of endpoints) {
    try {
      const epRes = await request(ep, {
        headers: { Cookie: cookieHeader }
      });
      console.log(`${epRes.status === 200 ? '✅' : '❌'} [${epRes.status}] ${ep}`);
      if (epRes.status !== 200) {
        console.log('   Response:', epRes.body.substring(0, 150));
      }
    } catch (e) {
      console.log(`❌ [FAIL] ${ep}: ${e.message}`);
    }
  }
}

run().catch(console.error);
