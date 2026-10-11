import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import {
  OutboxService,
  WebhookDeliveryService,
  OutboxEvent
} from './outbox.js';
import {
  WorkflowTestRunner,
  AccountingTemporalClient
} from './temporal/client.js';

describe('Phase 6: Real Workflows, Transactional Outbox & Signed Webhooks', () => {
  const TENANT_ID = '00000000-0000-0000-0000-000000000001';
  const WEBHOOK_SECRET = 'whsec_uae_test_secret_key_892348239048203948';

  // In-memory PostgreSQL instance for transactional outbox testing
  function setupTestDb() {
    const memDb = newDb();
    memDb.public.registerFunction({
      name: 'gen_random_uuid',
      impure: true,
      implementation: () => '11111111-2222-3333-4444-555555555555'
    });

    const pool = memDb.adapters.createPg().Pool;
    const pgPool = new pool();
    (pgPool as any).isPgMem = true;

    memDb.public.none(`
      CREATE TABLE outbox_events (
        id TEXT PRIMARY KEY DEFAULT '11111111-2222-3333-4444-555555555555',
        tenant_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        retry_count INT NOT NULL DEFAULT 0,
        next_retry_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    return pgPool;
  }

  describe('Transactional Outbox Pattern', () => {
    test('Records domain event into outbox atomically and transitions to PUBLISHED', async () => {
      const pool = setupTestDb();

      const event: OutboxEvent = {
        tenantId: TENANT_ID,
        eventType: 'INVOICE_POSTED',
        aggregateType: 'INVOICE',
        aggregateId: 'inv-2026-9001',
        payload: {
          invoiceNumber: 'INV-2026-9001',
          totalFils: 2100000,
          customerName: 'Al-Futtaim Group LLC'
        }
      };

      // 1. Record event in outbox
      const eventId = await OutboxService.recordEvent(pool, event);
      assert.ok(eventId);

      // 2. Fetch pending events
      const pending = await OutboxService.fetchPendingEvents(pool, 10);
      assert.equal(pending.length, 1);
      assert.equal(pending[0].eventType, 'INVOICE_POSTED');
      assert.equal(pending[0].aggregateId, 'inv-2026-9001');
      assert.equal(pending[0].payload.customerName, 'Al-Futtaim Group LLC');

      // 3. Mark published
      await OutboxService.markPublished(pool, pending[0].id!);
      const remainingPending = await OutboxService.fetchPendingEvents(pool, 10);
      assert.equal(remainingPending.length, 0);

      await pool.end();
    });

    test('Exponential backoff retries on failure and transitions to FAILED (DLQ) after max attempts', async () => {
      const pool = setupTestDb();

      const eventId = await OutboxService.recordEvent(pool, {
        tenantId: TENANT_ID,
        eventType: 'EINVOICE_TRANSMISSION_FAILED',
        aggregateType: 'INVOICE',
        aggregateId: 'inv-dlq-001',
        payload: { error: 'ASP gateway unavailable' }
      });

      // Attempt 1: retry count becomes 1, status remains PENDING
      const retry1 = await OutboxService.markFailed(pool, eventId, 0, 3);
      assert.equal(retry1.status, 'PENDING');
      assert.ok(retry1.nextRetryAt !== null);

      // Attempt 2: retry count becomes 2, status remains PENDING
      const retry2 = await OutboxService.markFailed(pool, eventId, 1, 3);
      assert.equal(retry2.status, 'PENDING');

      // Attempt 3 (Max retries = 3): Transitions to FAILED (DLQ)
      const retry3 = await OutboxService.markFailed(pool, eventId, 2, 3);
      assert.equal(retry3.status, 'FAILED');
      assert.equal(retry3.nextRetryAt, null);

      await pool.end();
    });
  });

  describe('Cryptographic Webhook Signing & Anti-Replay Verification', () => {
    test('Signs payload using HMAC-SHA256 and verifies successfully with correct secret', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const payloadString = JSON.stringify({ event: 'INVOICE_CLEARED', invoiceId: 'inv-101' });

      const signature = WebhookDeliveryService.signPayload(WEBHOOK_SECRET, timestamp, payloadString);
      assert.ok(signature.startsWith('sha256='));

      // Verify authentic signature
      const isValid = WebhookDeliveryService.verifySignature(
        WEBHOOK_SECRET,
        timestamp,
        payloadString,
        signature
      );
      assert.equal(isValid, true);
    });

    test('Rejects tampered payload, invalid secret, or expired timestamp (anti-replay)', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const payloadString = JSON.stringify({ event: 'INVOICE_CLEARED', amountFils: 500000 });
      const signature = WebhookDeliveryService.signPayload(WEBHOOK_SECRET, timestamp, payloadString);

      // 1. Tampered payload
      const tamperedPayload = JSON.stringify({ event: 'INVOICE_CLEARED', amountFils: 99999999 });
      const isTamperedValid = WebhookDeliveryService.verifySignature(
        WEBHOOK_SECRET,
        timestamp,
        tamperedPayload,
        signature
      );
      assert.equal(isTamperedValid, false);

      // 2. Wrong secret
      const isWrongSecretValid = WebhookDeliveryService.verifySignature(
        'wrong_secret_12345678901234567890',
        timestamp,
        payloadString,
        signature
      );
      assert.equal(isWrongSecretValid, false);

      // 3. Expired timestamp (> 300 seconds ago)
      const oldTimestamp = timestamp - 3600;
      const isReplayValid = WebhookDeliveryService.verifySignature(
        WEBHOOK_SECRET,
        oldTimestamp,
        payloadString,
        signature,
        300
      );
      assert.equal(isReplayValid, false);
    });

    test('Delivers webhook with proper X-Ledger headers and handles retry exhaustion to DLQ', async () => {
      let receivedHeaders: Record<string, string> = {};

      const mockSuccessFetch = async (_url: any, init: any) => {
        receivedHeaders = init.headers;
        return {
          ok: true,
          status: 200,
          statusText: 'OK'
        } as any;
      };

      const event: OutboxEvent = {
        id: 'evt-001',
        tenantId: TENANT_ID,
        eventType: 'RECONCILIATION_MATCHED',
        aggregateType: 'BANK_STATEMENT',
        aggregateId: 'stmt-001',
        payload: { matchedCount: 15 }
      };

      const result = await WebhookDeliveryService.deliverWebhook(
        { id: 'sub-01', url: 'https://api.subscriber.com/webhook', secret: WEBHOOK_SECRET, tenantId: TENANT_ID },
        event,
        1,
        mockSuccessFetch as any
      );

      assert.equal(result.success, true);
      assert.equal(result.status, 'DELIVERED');
      assert.ok(receivedHeaders['X-Ledger-Signature'].startsWith('sha256='));
      assert.equal(receivedHeaders['X-Ledger-Event-Type'], 'RECONCILIATION_MATCHED');

      // Test DLQ Exhaustion on attempt 5
      const mockFailFetch = async () => ({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable'
      } as any);

      const dlqResult = await WebhookDeliveryService.deliverWebhook(
        { id: 'sub-01', url: 'https://api.subscriber.com/webhook', secret: WEBHOOK_SECRET, tenantId: TENANT_ID },
        event,
        5, // attempt 5
        mockFailFetch as any
      );

      assert.equal(dlqResult.success, false);
      assert.equal(dlqResult.status, 'EXHAUSTED_DLQ');
    });

    test('Outbox Publisher dispatches batch to subscribers and logs delivery attempts', async () => {
      const pool = setupTestDb();

      // Setup webhook_subscriptions and webhook_delivery_attempts tables
      const memDb = (pool as any);
      // Create subscription and delivery tables in pg-mem
      await pool.query(`
        CREATE TABLE IF NOT EXISTS webhook_subscriptions (
          id TEXT PRIMARY KEY DEFAULT '22222222-3333-4444-5555-666666666666',
          tenant_id TEXT NOT NULL,
          url TEXT NOT NULL,
          secret TEXT NOT NULL,
          subscribed_events TEXT[] NOT NULL DEFAULT '{"*"}',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
          id TEXT PRIMARY KEY DEFAULT '33333333-4444-5555-6666-777777777777',
          tenant_id TEXT NOT NULL,
          subscription_id TEXT NOT NULL,
          outbox_event_id TEXT NOT NULL,
          attempt_number INT NOT NULL,
          status TEXT NOT NULL,
          response_status_code INT,
          error_message TEXT,
          delivered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Add subscription
      await pool.query(`
        INSERT INTO webhook_subscriptions (id, tenant_id, url, secret, subscribed_events, is_active)
        VALUES ('sub-100', $1, 'https://client-webhook.ae/events', $2, '{"*"}', TRUE);
      `, [TENANT_ID, WEBHOOK_SECRET]);

      // Add outbox event
      const eventId = await OutboxService.recordEvent(pool, {
        tenantId: TENANT_ID,
        eventType: 'PERIOD_CLOSED',
        aggregateType: 'PERIOD',
        aggregateId: '2026-01',
        payload: { period: '2026-01', status: 'CLOSED' }
      });

      // Mock fetch
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as any);

      const batchResult = await WebhookDeliveryService.dispatchPendingOutboxBatch(pool, 10, mockFetch as any);
      assert.equal(batchResult.processed, 1);
      assert.equal(batchResult.delivered, 1);
      assert.equal(batchResult.failed, 0);

      // Verify delivery attempt was recorded
      const attemptsRes = await pool.query(`SELECT * FROM webhook_delivery_attempts WHERE outbox_event_id = $1`, [eventId]);
      assert.equal(attemptsRes.rows.length, 1);
      assert.equal(attemptsRes.rows[0].status, 'DELIVERED');
      assert.equal(attemptsRes.rows[0].response_status_code, 200);

      // Verify outbox status transitioned to PUBLISHED
      const outboxRes = await pool.query(`SELECT status FROM outbox_events WHERE id = $1`, [eventId]);
      assert.equal(outboxRes.rows[0].status, 'PUBLISHED');

      await pool.end();
    });
  });

  describe('Temporal Workflows: Month-End Close, E-Invoicing & Bank Sync', () => {
    test('Month-End Close Workflow executes all 6 activities sequentially and emits outbox event', async () => {
      const output = await WorkflowTestRunner.runMonthEndClose(TENANT_ID, '2026-01');

      assert.equal(output.status, 'COMPLETED');
      assert.equal(output.periodId, '2026-01');
      assert.equal(output.depreciation.assetsProcessed, 14);
      assert.equal(output.fxRevaluation.accountsRevalued, 6);
      assert.equal(output.vatDraft.periodId, '2026-01');
      assert.equal(output.periodLock.isLocked, true);
      assert.ok(output.outboxEventId.startsWith('outbox-'));
    });

    test('Month-End Close Workflow halts if precondition fails', async () => {
      await assert.rejects(
        async () => {
          await WorkflowTestRunner.runMonthEndClose(TENANT_ID, '2026-01', {
            validatePeriodPreconditionsActivity: async () => ({ ready: false, openItemsCount: 5 })
          });
        },
        /Period preconditions failed with 5 open items/
      );
    });

    test('E-Invoice Retry Workflow retries transient outage, archives for 10 years, and publishes outbox', async () => {
      const ublXml = '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ID>INV-2026-001</ID></Invoice>';

      // Transient failure on first attempt that resolves on retry
      let attempt = 0;
      const output = await WorkflowTestRunner.runEinvoiceRetry(TENANT_ID, 'INV-2026-001', ublXml, {
        transmitToAspSandboxActivity: async () => {
          attempt++;
          if (attempt === 1) {
            throw new Error('ASP_TIMEOUT');
          }
          return {
            invoiceId: 'INV-2026-001',
            status: 'ACCEPTED',
            transmissionId: 'tx-cleared-001',
            archiveHash: 'hash-sha256-verified'
          };
        }
      });

      assert.equal(output.status, 'ACCEPTED');
      assert.equal(output.invoiceId, 'INV-2026-001');
      assert.equal(output.transmissionId, 'tx-cleared-001');
      assert.equal(output.archiveId, 'arc-INV-2026-001');
      assert.ok(output.outboxEventId);
    });

    test('E-Invoice Retry Workflow immediately rejects invalid UBL without retry', async () => {
      const invalidUbl = '<MalformedXml></MalformedXml>';
      const output = await WorkflowTestRunner.runEinvoiceRetry(TENANT_ID, 'INV-ERR-001', invalidUbl);

      assert.equal(output.status, 'REJECTED');
      assert.equal(output.invoiceId, 'INV-ERR-001');
    });

    test('AccountingTemporalClient generates deterministic workflow IDs', async () => {
      const client = new AccountingTemporalClient();
      const closeId = await client.triggerMonthEndClose(TENANT_ID, '2026-01', 'wf-close-2026-01');
      const einvoiceId = await client.triggerEinvoiceRetry(TENANT_ID, 'inv-123', '<Invoice/>', 'wf-einv-123');
      const bankSyncId = await client.triggerBankFeedSync(TENANT_ID, 'acc-999', 'LEAN_TECHNOLOGIES', 'wf-bank-999');

      assert.equal(closeId, 'wf-close-2026-01');
      assert.equal(einvoiceId, 'wf-einv-123');
      assert.equal(bankSyncId, 'wf-bank-999');
    });
  });
});
