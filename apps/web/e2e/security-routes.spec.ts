import { test, expect } from '@playwright/test';
import { generateSync } from 'otplib';
import { AuthenticationService, UserRole } from '@ledger-ae/shared-types';
import { TEST_TOTP_SECRET } from './auth-helper';

const JWT_SECRET = '01234567890123456789012345678901';

const PROTECTED_ROUTES = [
  { path: '/api/dashboard/metrics', method: 'GET' },
  { path: '/api/ledger/accounts', method: 'GET' },
  { path: '/api/ledger/journals', method: 'GET' },
  { path: '/api/tax/vat201', method: 'GET' },
  { path: '/api/banking/reconciliation', method: 'GET' },
  { path: '/api/invoicing', method: 'GET' },
  { path: '/api/close', method: 'GET' },
  { path: '/api/ai/proposals', method: 'GET' },
  { path: '/api/reports', method: 'GET' }
];

test.describe('Phase 4 Security: Auth Bypass, Session Revocation, and Cross-Tenant Isolation', () => {

  test.describe('1. Auth Bypass Protection Across Every Protected Route', () => {
    for (const route of PROTECTED_ROUTES) {
      test(`Unauthenticated request to ${route.method} ${route.path} returns 401`, async ({ request }) => {
        const res = await request.get(route.path);
        expect(res.status()).toBe(401);
        const body = await res.json();
        expect(body.error).toContain('UNAUTHORIZED');
      });

      test(`Forged signature token to ${route.method} ${route.path} returns 401`, async ({ request }) => {
        const forgedToken = AuthenticationService.signSessionToken(
          {
            userId: 'usr-attacker',
            tenantId: '00000000-0000-0000-0000-000000000001',
            entityId: '00000000-0000-0000-0000-000000000001',
            role: UserRole.CFO,
            email: 'attacker@evil.com',
            issuedAt: Date.now(),
            expiresAt: Date.now() + 3600000
          },
          'invalid_attacker_key_32_bytes_long_here!'
        );

        const res = await request.get(route.path, {
          headers: {
            Cookie: `ledger_session=${forgedToken}`
          }
        });
        expect(res.status()).toBe(401);
        const body = await res.json();
        expect(body.error).toContain('UNAUTHORIZED');
      });

      test(`Expired session token to ${route.method} ${route.path} returns 401`, async ({ request }) => {
        const expiredToken = AuthenticationService.signSessionToken(
          {
            userId: 'usr-expired',
            tenantId: '00000000-0000-0000-0000-000000000001',
            entityId: '00000000-0000-0000-0000-000000000001',
            role: UserRole.CFO,
            email: 'expired@alnoor.ae',
            issuedAt: Date.now() - 7200000,
            expiresAt: Date.now() - 1000 // Expired
          },
          JWT_SECRET
        );

        const res = await request.get(route.path, {
          headers: {
            Cookie: `ledger_session=${expiredToken}`
          }
        });
        expect(res.status()).toBe(401);
        const body = await res.json();
        expect(body.error).toContain('UNAUTHORIZED');
      });
    }

    test('Role lacking required permission returns 403 Forbidden', async ({ request }) => {
      const { Pool } = await import('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://ledger_app:ledger_app_secure_pass@localhost:9527/ledger_ae_test'
      });
      
      const client = await pool.connect();
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", ['00000000-0000-0000-0000-000000000001']);
      const uRes = await client.query("SELECT id FROM users WHERE email = 'accountant@alnoor.ae'");
      const realUserId = uRes.rows[0].id;
      await client.query('COMMIT');
      client.release();

      // Create session in DB for VIEWER role attempting to post a journal entry (requires LEDGER_POST)
      const viewerPayload = {
        userId: realUserId,
        tenantId: '00000000-0000-0000-0000-000000000001',
        entityId: '00000000-0000-0000-0000-000000000001',
        role: UserRole.VIEWER,
        email: 'viewer@alnoor.ae',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000
      };
      const viewerToken = AuthenticationService.signSessionToken(viewerPayload, JWT_SECRET);

      await AuthenticationService.createSession(pool, {
        tenantId: viewerPayload.tenantId,
        entityId: viewerPayload.entityId,
        userId: viewerPayload.userId,
        role: UserRole.VIEWER,
        sessionToken: viewerToken,
        expiresAt: new Date(viewerPayload.expiresAt)
      });
      await pool.end();

      const res = await request.post('/api/ledger/journals', {
        headers: {
          Cookie: `ledger_session=${viewerToken}`,
          'Content-Type': 'application/json'
        },
        data: {
          entryNumber: 'JV-ATTACK-001',
          postingDate: '2026-01-20',
          lines: []
        }
      });

      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body.error).toContain('FORBIDDEN');
    });
  });

  test.describe('2. Server-Side Session Revocation in Database', () => {
    test('Logged out session token is immediately rejected on subsequent requests', async ({ request }) => {
      // 1. Perform legitimate login
      const loginRes = await request.post('/api/auth/login', {
        data: {
          email: 'accountant@alnoor.ae',
          password: 'Password@123',
          tenantSlug: 'al-noor-group'
        }
      });
      expect(loginRes.status()).toBe(200);
      const loginBody = await loginRes.json();
      expect(loginBody.requires2FA).toBe(true);

      // 2. Complete 2FA verification
      const totpCode = generateSync({ secret: TEST_TOTP_SECRET });
      const verifyRes = await request.post('/api/auth/verify-2fa', {
        data: {
          tempToken: loginBody.tempToken,
          code: totpCode
        }
      });
      expect(verifyRes.status()).toBe(200);

      // Extract set-cookie
      const setCookie = verifyRes.headers()['set-cookie'] || '';
      const match = setCookie.match(/ledger_session=([^;]+)/);
      expect(match).toBeTruthy();
      const sessionCookie = match ? match[1] : '';

      // 3. Make authenticated request -> 200 OK
      const getRes1 = await request.get('/api/ledger/accounts', {
        headers: {
          Cookie: `ledger_session=${sessionCookie}`
        }
      });
      expect(getRes1.status()).toBe(200);

      // 4. Logout (revokes session in PostgreSQL sessions table)
      const logoutRes = await request.post('/api/auth/logout', {
        headers: {
          Cookie: `ledger_session=${sessionCookie}`
        }
      });
      expect(logoutRes.status()).toBe(200);

      // 5. Re-attempt authenticated request with revoked session cookie -> 401 Unauthorized
      const getRes2 = await request.get('/api/ledger/accounts', {
        headers: {
          Cookie: `ledger_session=${sessionCookie}`
        }
      });
      expect(getRes2.status()).toBe(401);
      const body2 = await getRes2.json();
      expect(body2.error).toContain('UNAUTHORIZED');
      expect(body2.error).toContain('revoked');
    });
  });

  test.describe('3. Cross-Tenant Access Protection & Header Spoofing Resistance', () => {
    test('Tenant B cannot access Tenant A data and client headers are strictly ignored', async ({ request }) => {
      // 1. Authenticate as Tenant B (Alpha Corporation)
      const loginResB = await request.post('/api/auth/login', {
        data: {
          email: 'auditor@alphacorp.ae',
          password: 'Password@123',
          tenantSlug: 'alpha-group'
        }
      });
      expect(loginResB.status()).toBe(200);
      const loginBodyB = await loginResB.json();

      const totpCodeB = generateSync({ secret: TEST_TOTP_SECRET });
      const verifyResB = await request.post('/api/auth/verify-2fa', {
        data: {
          tempToken: loginBodyB.tempToken,
          code: totpCodeB
        }
      });
      expect(verifyResB.status()).toBe(200);

      const setCookieB = verifyResB.headers()['set-cookie'] || '';
      const matchB = setCookieB.match(/ledger_session=([^;]+)/);
      expect(matchB).toBeTruthy();
      const sessionCookieB = matchB ? matchB[1] : '';

      // 2. Tenant B accesses Accounts -> zero accounts from Tenant A ('Al-Noor') leak
      const accRes = await request.get('/api/ledger/accounts', {
        headers: {
          Cookie: `ledger_session=${sessionCookieB}`
        }
      });
      expect(accRes.status()).toBe(200);
      const accData = await accRes.json();
      expect(Array.isArray(accData.accounts)).toBe(true);
      for (const acc of accData.accounts) {
        expect(acc.nameEn).not.toContain('Emirates NBD');
        expect(acc.nameEn).not.toContain('Al-Noor');
      }

      // 3. Tenant B accesses Journals -> zero journals from Tenant A leak
      const jvRes = await request.get('/api/ledger/journals', {
        headers: {
          Cookie: `ledger_session=${sessionCookieB}`
        }
      });
      expect(jvRes.status()).toBe(200);
      const jvData = await jvRes.json();
      for (const jv of jvData.journals) {
        expect(jv.entryNumber).not.toBe('JV-2026-OPENING');
        expect(jv.entryNumber).not.toBe('JV-2026-0001');
      }

      // 4. Tenant B accesses Invoices -> zero invoices from Tenant A leak
      const invRes = await request.get('/api/invoicing', {
        headers: {
          Cookie: `ledger_session=${sessionCookieB}`
        }
      });
      expect(invRes.status()).toBe(200);
      const invData = await invRes.json();
      for (const inv of invData.invoices) {
        expect(inv.documentNumber).not.toBe('INV-2026-0101');
        expect(inv.documentNumber).not.toBe('BILL-2026-5501');
      }

      // 5. Header Spoofing Attempt: Tenant B sends header `x-tenant-id: 00000000-0000-0000-0000-000000000001`
      const spoofRes = await request.get('/api/ledger/accounts', {
        headers: {
          Cookie: `ledger_session=${sessionCookieB}`,
          'x-tenant-id': '00000000-0000-0000-0000-000000000001',
          'x-entity-id': '00000000-0000-0000-0000-000000000001'
        }
      });
      expect(spoofRes.status()).toBe(200);
      const spoofData = await spoofRes.json();
      for (const acc of spoofData.accounts) {
        expect(acc.nameEn).not.toContain('Emirates NBD');
        expect(acc.nameEn).not.toContain('Al-Noor');
      }

      // 6. Cross-Tenant Mutation Attempt: Tenant B tries to approve Tenant A's invoice
      const crossApproveRes = await request.post('/api/invoicing', {
        headers: {
          Cookie: `ledger_session=${sessionCookieB}`,
          'Content-Type': 'application/json'
        },
        data: {
          action: 'APPROVAL',
          invoiceId: 'd0000000-0000-0000-0000-000000000101', // Tenant A invoice ID
          decision: 'APPROVE'
        }
      });
      expect(crossApproveRes.status()).toBe(404);
      const crossApproveBody = await crossApproveRes.json();
      expect(crossApproveBody.error).toContain('not found or not owned by tenant');

      // 7. Cross-Tenant Mutation Attempt: Tenant B tries to reconcile Tenant A's statement line
      const crossMatchRes = await request.post('/api/banking/reconciliation', {
        headers: {
          Cookie: `ledger_session=${sessionCookieB}`,
          'Content-Type': 'application/json'
        },
        data: {
          action: 'MATCH',
          statementLineId: 'e0000000-0000-0000-0000-000000000001', // Tenant A statement line ID
          ledgerLineId: '00000000-0000-0000-0000-000000000010'
        }
      });
      expect(crossMatchRes.status()).toBe(404);
      const crossMatchBody = await crossMatchRes.json();
      expect(crossMatchBody.error).toContain('not found or not owned by tenant');
    });
  });
});
