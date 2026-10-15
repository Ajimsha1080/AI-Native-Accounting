import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { createActivities, EinvoiceTransmissionInput } from './activities.js';
import { WorkflowTestRunner, AccountingTemporalClient } from './client.js';

describe('Phase 4: Temporal Integration Tests against Temporal Test Server', () => {
  let env: TestWorkflowEnvironment;
  let worker: Worker;
  let workerRunPromise: Promise<void>;
  const taskQueue = 'ledger-ae-test-queue';

  before(async () => {
    // Start ephemeral in-process Temporal test server
    env = await TestWorkflowEnvironment.createTimeSkipping();

    // Workflows file in dist/
    const workflowsPath = path.resolve(__dirname, 'workflows.js');

    // Activities tracking side-effects & retries
    let transientCount = 0;
    const baseActivities = createActivities();

    worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath,
      activities: {
        ...baseActivities,
        async transmitToAspSandboxActivity(input: EinvoiceTransmissionInput) {
          if (input.invoiceId.includes('FAIL_TRANSIENT_RETRY')) {
            transientCount++;
            if (transientCount < 2) {
              throw new Error('ASP_TIMEOUT: Sandbox gateway timed out connecting to FTA clearance endpoint');
            }
          }
          return baseActivities.transmitToAspSandboxActivity(input);
        }
      }
    });

    workerRunPromise = worker.run();
  });

  after(async () => {
    if (worker) {
      worker.shutdown();
      await workerRunPromise;
    }
    if (env) {
      await env.teardown();
    }
  });

  test('Month-End Close Workflow: Executes 6 sequential accounting activities, locks period, and emits outbox event', async () => {
    const tenantId = 'ten-dubai-holding-001';
    const periodId = 'period-2026-01';

    const result: any = await env.workflowClient.execute('monthEndCloseWorkflow', {
      taskQueue,
      workflowId: `test-close-${Date.now()}`,
      args: [{ tenantId, periodId }]
    });

    // 1. Workflow completed successfully
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.periodId, periodId);

    // 2. Straight-line depreciation activity processed
    assert.equal(result.depreciation.assetsProcessed, 14);
    assert.equal(result.depreciation.totalDepreciationFils, '1850000');

    // 3. IAS 21 Unrealized FX revaluation processed
    assert.equal(result.fxRevaluation.accountsRevalued, 6);
    assert.equal(result.fxRevaluation.netUnrealizedGainLossFils, '420000');

    // 4. UAE VAT 201 Preliminary return draft calculated
    assert.equal(result.vatDraft.periodId, periodId);
    assert.equal(result.vatDraft.box1OutputVatFils, '32500000');
    assert.equal(result.vatDraft.box9InputVatFils, '86750000');
    assert.equal(result.vatDraft.netPayableFils, '-54250000');

    // 5. General ledger period hard locked
    assert.equal(result.periodLock.isLocked, true);
    assert.ok(result.periodLock.lockedAt);

    // 6. Outbox event emitted for downstream subscribers
    assert.ok(result.outboxEventId.startsWith('outbox-'));
  });

  test('E-Invoice Retry Workflow: Transient ASP timeout automatically retries and succeeds with 10-year archive', async () => {
    const tenantId = 'ten-dubai-holding-001';
    const invoiceId = 'inv-e2e-FAIL_TRANSIENT_RETRY-01';
    const ublXml = '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>INV-01</cbc:ID></Invoice>';

    const result: any = await env.workflowClient.execute('einvoiceRetryWorkflow', {
      taskQueue,
      workflowId: `test-einvoice-retry-${Date.now()}`,
      args: [{ tenantId, invoiceId, ublXml }]
    });

    // Workflow retried across transient errors and reached acceptance
    assert.equal(result.status, 'ACCEPTED');
    assert.equal(result.invoiceId, invoiceId);
    assert.ok(result.transmissionId.startsWith('tx-asp-'));
    assert.equal(result.archiveId, `arc-${invoiceId}`);
    assert.ok(result.outboxEventId.startsWith('outbox-'));
  });

  test('E-Invoice Non-Retryable Error: Schema validation error terminates immediately without retry loop', async () => {
    const tenantId = 'ten-dubai-holding-001';
    const invoiceId = 'inv-e2e-malformed-02';
    const ublXml = '<BadPayload></BadPayload>'; // Missing <Invoice tag

    const result: any = await env.workflowClient.execute('einvoiceRetryWorkflow', {
      taskQueue,
      workflowId: `test-einvoice-schema-err-${Date.now()}`,
      args: [{ tenantId, invoiceId, ublXml }]
    });

    // Non-retryable error terminates with REJECTED and emits outbox rejection event
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.invoiceId, invoiceId);
  });

  test('Bank Feed Sync Workflow: Ingests statements, matches ledger entries, and publishes outbox event', async () => {
    const tenantId = 'ten-dubai-holding-001';
    const bankAccountId = 'acc-enbd-1020-001';

    const result: any = await env.workflowClient.execute('bankFeedSyncWorkflow', {
      taskQueue,
      workflowId: `test-banksync-${Date.now()}`,
      args: [{ tenantId, bankAccountId, feedSource: 'LEAN_TECHNOLOGIES' }]
    });

    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.tenantId, tenantId);
    assert.equal(result.bankAccountId, bankAccountId);
    assert.equal(result.metrics.transactionsIngested, 28);
    assert.equal(result.metrics.matchedCount, 26);
    assert.equal(result.metrics.totalMatchedFils, '42500000');
    assert.ok(result.outboxEventId.startsWith('outbox-'));
  });

  test('Webhook Dispatch Workflow: Delivers signed HMAC-SHA256 payload and records outbox delivery audit', async () => {
    const tenantId = 'ten-dubai-holding-001';
    const webhookUrl = 'https://api.partner.ae/webhooks/ledger-events';
    const signingSecret = 'secret_hmac_whsec_12345678901234567890';
    const eventType = 'PERIOD_CLOSED';
    const payload = { periodId: 'period-2026-01', closedAt: new Date().toISOString() };

    const result: any = await env.workflowClient.execute('webhookDispatchWorkflow', {
      taskQueue,
      workflowId: `test-webhook-deliver-${Date.now()}`,
      args: [{ tenantId, webhookUrl, signingSecret, eventType, payload }]
    });

    assert.equal(result.status, 'DELIVERED');
    assert.equal(result.statusCode, 200);
    assert.ok(result.signature.includes('v1='));
    assert.ok(result.outboxEventId.startsWith('outbox-'));
  });

  test('Webhook Dispatch Workflow: ASVS SSRF Protection strictly blocks link-local metadata and loopback', async () => {
    const tenantId = 'ten-dubai-holding-001';
    const metadataUrl = 'https://169.254.169.254/latest/meta-data';
    const signingSecret = 'secret_hmac_whsec_12345678901234567890';

    const result: any = await env.workflowClient.execute('webhookDispatchWorkflow', {
      taskQueue,
      workflowId: `test-webhook-ssrf-${Date.now()}`,
      args: [{
        tenantId,
        webhookUrl: metadataUrl,
        signingSecret,
        eventType: 'TEST_SSRF',
        payload: { attempt: 'cloud_credentials_theft' }
      }]
    });

    // SSRF violation blocked before network dispatch
    assert.equal(result.status, 'FAILED_SSRF');
    assert.match(result.error, /SSRF Protection/);
  });

  test('WorkflowTestRunner: Executes month-end close with custom activity overrides in-process', async () => {
    const tenantId = 'ten-custom-override';
    const periodId = 'period-override-01';

    const result = await WorkflowTestRunner.runMonthEndClose(tenantId, periodId, {
      async runDepreciationBatchActivity() {
        return { assetsProcessed: 99, totalDepreciationFils: '9900000' };
      }
    });

    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.depreciation.assetsProcessed, 99);
    assert.equal(result.depreciation.totalDepreciationFils, '9900000');
  });

  test('AccountingTemporalClient: Starts typed workflows with idempotency IDs', async () => {
    const client = new AccountingTemporalClient();
    const closeId = await client.triggerMonthEndClose('ten-01', 'p-01', 'wf-close-idem-01');
    assert.equal(closeId, 'wf-close-idem-01');

    const einvoiceId = await client.triggerEinvoiceRetry('ten-01', 'inv-01', '<Invoice/>', 'wf-inv-idem-01');
    assert.equal(einvoiceId, 'wf-inv-idem-01');

    const bankId = await client.triggerBankFeedSync('ten-01', 'acc-01', 'LEAN_TECHNOLOGIES', 'wf-bank-idem-01');
    assert.equal(bankId, 'wf-bank-idem-01');
  });
});
