import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SecurityHardeningEngine,
  DisasterRecoveryEngine,
  TenantDataRetentionRecord
} from './security-hardening.js';
import { Direction, JournalEntryCandidate } from './invariants.js';
import { Pool } from 'pg';
import { AuthenticationService } from '@ledger-ae/shared-types';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://ledger_app:ledger_app_secure_pass@localhost:9527/ledger_ae_test';

describe('Milestone 13: Hardening & ASVS Level 2 Verification', () => {
  test('ASVS V10: SSRF Protection blocks private IPs, cloud metadata, and unencrypted protocols', () => {
    // 1. Private IPv4 addresses blocked
    assert.equal(SecurityHardeningEngine.validateWebhookUrl('https://127.0.0.1:8080/hook').isValid, false);
    assert.equal(SecurityHardeningEngine.validateWebhookUrl('https://10.0.0.15/webhook').isValid, false);
    assert.equal(SecurityHardeningEngine.validateWebhookUrl('https://192.168.1.100/webhook').isValid, false);
    assert.equal(SecurityHardeningEngine.validateWebhookUrl('https://172.20.5.1/webhook').isValid, false);
    assert.equal(SecurityHardeningEngine.validateWebhookUrl('https://localhost/webhook').isValid, false);

    // 2. Cloud metadata service (AWS/Azure/GCP link-local) blocked
    const metadataCheck = SecurityHardeningEngine.validateWebhookUrl('https://169.254.169.254/latest/meta-data');
    assert.equal(metadataCheck.isValid, false);
    assert.ok(metadataCheck.error?.includes('SSRF Protection'));

    // 3. Insecure HTTP blocked
    const httpCheck = SecurityHardeningEngine.validateWebhookUrl('http://api.partner.ae/webhook');
    assert.equal(httpCheck.isValid, false);
    assert.ok(httpCheck.error?.includes('strictly use HTTPS'));

    // 4. Valid external HTTPS permitted
    assert.equal(SecurityHardeningEngine.validateWebhookUrl('https://api.partner.ae/webhook/v1').isValid, true);
    assert.equal(SecurityHardeningEngine.validateWebhookUrl('https://hooks.slack.com/services/T00/B00/X00').isValid, true);
  });

  test('ASVS V5: Input Validation & Injection Detection blocks SQLi, XSS, and path traversal', () => {
    // SQL Injection
    assert.equal(SecurityHardeningEngine.detectInjectionAttempt("'; DROP TABLE ledger_entries; --"), true);
    assert.equal(SecurityHardeningEngine.detectInjectionAttempt("1' UNION SELECT * FROM users --"), true);

    // Cross-Site Scripting (XSS)
    assert.equal(SecurityHardeningEngine.detectInjectionAttempt("<script>document.cookie='leak'</script>"), true);

    // Path Traversal
    assert.equal(SecurityHardeningEngine.detectInjectionAttempt("../../etc/secrets/config.json"), true);

    // Legitimate accounting text permitted
    assert.equal(SecurityHardeningEngine.detectInjectionAttempt("Q1 Audit adjustment for unbilled retainer fees"), false);
    assert.equal(SecurityHardeningEngine.detectInjectionAttempt("Invoice #INV-2026-9901 for software licensing"), false);
  });

  test('ASVS V4: Multi-Tenant Isolation strictly prevents cross-tenant access', () => {
    const tenantA = 'ten-dubai-trading-01';
    const tenantB = 'ten-sharjah-logistics-02';

    // Same tenant succeeds
    assert.doesNotThrow(() => SecurityHardeningEngine.assertTenantIsolation(tenantA, tenantA));

    // Cross-tenant throws violation
    assert.throws(
      () => SecurityHardeningEngine.assertTenantIsolation(tenantA, tenantB),
      /CROSS-TENANT ACCESS VIOLATION/
    );
  });

  test('UAE PDPL Data Retention & Legal Hold: Prevents premature deletion and honors legal holds', () => {
    const record: TenantDataRetentionRecord = {
      tenantId: 'ten-01',
      documentId: 'doc-invoice-2024-01',
      creationDate: '2024-01-01',
      retentionExpiryDate: '2029-01-01', // 5-year UAE statutory retention
      isLegalHoldActive: false
    };

    // Attempting deletion in 2026 (< 2029) is blocked
    assert.throws(
      () => SecurityHardeningEngine.assertDeletionPermitted(record, '2026-06-15'),
      /not reached statutory retention expiry/
    );

    // Record past expiry date (in 2030) without legal hold is permitted
    assert.equal(SecurityHardeningEngine.assertDeletionPermitted(record, '2030-01-02'), true);

    // Record past expiry date BUT under active Legal Hold is strictly blocked
    const legalHoldRecord: TenantDataRetentionRecord = {
      ...record,
      isLegalHoldActive: true
    };
    assert.throws(
      () => SecurityHardeningEngine.assertDeletionPermitted(legalHoldRecord, '2030-01-02'),
      /active Legal Hold/
    );
  });
});

describe('Milestone 13: Disaster Recovery (DR) Drill - RPO <= 5 min, RTO <= 1 hour Restore Verification', () => {
  test('Simulated PITR Restore Drill verifies RPO <= 5m, RTO <= 1h, and post-restore ledger integrity', () => {
    const crashTime = Date.now();
    const lastBackupTime = crashTime - 2 * 60 * 1000; // 2 minutes ago (well within 5 min RPO)

    // Seed test vouchers with balanced lines
    const vouchers: JournalEntryCandidate[] = [
      {
        tenantId: 'ten-dr-01',
        entityId: 'ent-dr-01',
        bookId: 'book-statutory',
        periodId: 'period-2026-01',
        entryNumber: 'VOUCHER-DR-001',
        postingDate: '2026-01-15',
        documentDate: '2026-01-15',
        sourceModule: 'DR_DRILL',
        memoEn: 'Disaster Recovery Test Voucher 1',
        createdBy: 'usr-dr-admin',
        lines: [
          {
            accountId: 'acc-asset-bank',
            currency: 'AED',
            amountTxn: 10000000n, // AED 100,000.00
            amountBase: 10000000n,
            fxRate: 100000000n,
            direction: Direction.DEBIT
          },
          {
            accountId: 'acc-equity-capital',
            currency: 'AED',
            amountTxn: 10000000n,
            amountBase: 10000000n,
            fxRate: 100000000n,
            direction: Direction.CREDIT
          }
        ]
      },
      {
        tenantId: 'ten-dr-01',
        entityId: 'ent-dr-01',
        bookId: 'book-statutory',
        periodId: 'period-2026-01',
        entryNumber: 'VOUCHER-DR-002',
        postingDate: '2026-01-16',
        documentDate: '2026-01-16',
        sourceModule: 'DR_DRILL',
        memoEn: 'Disaster Recovery Test Voucher 2',
        createdBy: 'usr-dr-admin',
        lines: [
          {
            accountId: 'acc-exp-rent',
            currency: 'AED',
            amountTxn: 2500000n, // AED 25,000.00
            amountBase: 2500000n,
            fxRate: 100000000n,
            direction: Direction.DEBIT
          },
          {
            accountId: 'acc-asset-bank',
            currency: 'AED',
            amountTxn: 2500000n,
            amountBase: 2500000n,
            fxRate: 100000000n,
            direction: Direction.CREDIT
          }
        ]
      }
    ];

    const drillResult = DisasterRecoveryEngine.runSimulatedRestoreDrill({
      drillId: 'drill-quarterly-q1-2026',
      simulatedCrashTimestamp: crashTime,
      lastWalBackupTimestamp: lastBackupTime,
      vouchers
    });

    // Verification of NFR Targets:
    // 1. Status is SUCCESS
    assert.equal(drillResult.status, 'SUCCESS');
    // 2. RPO <= 5 minutes
    assert.equal(drillResult.isRpoMet, true);
    assert.ok(drillResult.achievedRpoMinutes <= 5.0);
    // 3. RTO <= 60 minutes
    assert.equal(drillResult.isRtoMet, true);
    assert.ok(drillResult.achievedRtoSeconds <= 3600);
    // 4. Restored Ledger Invariant: Debits == Credits verified
    assert.equal(drillResult.ledgerIntegrityVerified, true);
    assert.equal(drillResult.restoredVouchersCount, 2);
    assert.ok(drillResult.verificationDetails.some((d) => d.includes('ZERO VARIANCE')));
  });
});

describe('Phase 4 Security: Rate Limiting & Replay Persistence (Real Postgres)', () => {
  test('Rate Limit Persistence: Brute-force lockout persists in Postgres auth_rate_limits table across process restarts', async () => {
    let pool = new Pool({ connectionString: TEST_DATABASE_URL });
    const identifier = `al-noor-group:attacker-${Date.now()}@pentest.ae`;

    try {
      // 1. Initial state: 0 attempts, not locked
      const initial = await AuthenticationService.checkRateLimit(identifier, pool, 5, 15 * 60 * 1000);
      assert.equal(initial.isLocked, false);
      assert.equal(initial.attemptsRemaining, 5);

      // 2. Perform 5 failed brute-force attempts
      let lastRate: any;
      for (let i = 1; i <= 5; i++) {
        lastRate = await AuthenticationService.recordFailedAttempt(identifier, pool, 5, 15 * 60 * 1000);
      }

      // 3. Rate limiter triggers lockout
      assert.equal(lastRate.isLocked, true);
      assert.equal(lastRate.attemptsRemaining, 0);

      // 4. Verify PostgreSQL persistence in auth_rate_limits table
      const res = await pool.query('SELECT failed_attempts, locked_until FROM auth_rate_limits WHERE identifier = $1', [identifier]);
      assert.equal(res.rows.length, 1);
      assert.equal(res.rows[0].failed_attempts, 5);
      assert.ok(res.rows[0].locked_until);
      assert.ok(new Date(res.rows[0].locked_until).getTime() > Date.now());

      // 5. SIMULATE COLD PROCESS RESTART:
      // Sever the database connection pool completely and instantiate a fresh pool
      await pool.end();

      const newPool = new Pool({ connectionString: TEST_DATABASE_URL });
      try {
        // Query checkRateLimit on new server instance: must remain locked
        const postRestart = await AuthenticationService.checkRateLimit(identifier, newPool, 5, 15 * 60 * 1000);
        assert.equal(postRestart.isLocked, true, 'Lockout must persist across server restarts in PostgreSQL');
        assert.equal(postRestart.attemptsRemaining, 0);

        // 6. Reset attempts upon successful verification or admin unlock
        await AuthenticationService.resetAttempts(identifier, newPool);
        const postReset = await AuthenticationService.checkRateLimit(identifier, newPool, 5, 15 * 60 * 1000);
        assert.equal(postReset.isLocked, false);
        assert.equal(postReset.attemptsRemaining, 5);
      } finally {
        await newPool.end();
      }
    } finally {
      // Clean up if pool is still open
      try {
        await pool.end();
      } catch {}
    }
  });

  test('MCP Ticket Replay Protection: Burned approval nonces persist in PostgreSQL and block replay attacks', async () => {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL });
    const nonce = `test-nonce-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tenantId = '00000000-0000-0000-0000-000000000001';
    const proposalId = `prop-test-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 600000);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);

      // Query seeded user for foreign key relation
      const uRes = await client.query('SELECT id FROM users WHERE tenant_id = $1 LIMIT 1', [tenantId]);
      const approverId = uRes.rows[0].id;

      // 1. First consumption of approval ticket nonce succeeds
      await client.query(
        `INSERT INTO mcp_burned_nonces (nonce, tenant_id, proposal_id, consumed_by, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [nonce, tenantId, proposalId, approverId, expiresAt]
      );

      // 2. REPLAY ATTACK: Second insertion with identical nonce is strictly rejected by primary key unique constraint
      await assert.rejects(
        async () => {
          await client.query(
            `INSERT INTO mcp_burned_nonces (nonce, tenant_id, proposal_id, consumed_by, expires_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [nonce, tenantId, proposalId, approverId, expiresAt]
          );
        },
        (err: any) => err.code === '23505' // PostgreSQL unique_violation
      );

      await client.query('ROLLBACK'); // Roll back test nonce
    } finally {
      client.release();
      await pool.end();
    }
  });
});

