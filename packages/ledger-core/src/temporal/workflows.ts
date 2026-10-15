import { proxyActivities } from '@temporalio/workflow';
import type {
  Activities,
  MonthEndCloseActivityInput,
  EinvoiceTransmissionInput,
  BankFeedSyncInput,
  DepreciationActivityResult,
  FxRevaluationActivityResult,
  VatReturnDraftResult,
  PeriodLockResult,
  EinvoiceTransmissionResult,
  BankFeedSyncResult,
  WebhookDispatchInput,
  WebhookDispatchResult
} from './activities.js';

const {
  validatePeriodPreconditionsActivity,
  runDepreciationBatchActivity,
  runFxRevaluationBatchActivity,
  generateVatReturnDraftActivity,
  lockFinancialPeriodActivity,
  validatePintAeUblActivity,
  transmitToAspSandboxActivity,
  archiveToTenYearStoreActivity,
  fetchAndMatchBankFeedActivity,
  publishOutboxEventActivity,
  dispatchWebhookActivity
} = proxyActivities<Activities>({
  startToCloseTimeout: '1 minute',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumAttempts: 4,
    nonRetryableErrorTypes: ['SchemaValidationError', 'UnbalancedEntryError']
  }
});

export interface MonthEndCloseWorkflowOutput {
  status: 'COMPLETED' | 'FAILED';
  periodId: string;
  depreciation: DepreciationActivityResult;
  fxRevaluation: FxRevaluationActivityResult;
  vatDraft: VatReturnDraftResult;
  periodLock: PeriodLockResult;
  outboxEventId: string;
}

export interface EinvoiceWorkflowOutput {
  status: 'ACCEPTED' | 'REJECTED' | 'FAILED_DLQ';
  invoiceId: string;
  transmissionId?: string;
  archiveId?: string;
  outboxEventId?: string;
}

export interface BankSyncWorkflowOutput {
  status: 'COMPLETED';
  tenantId: string;
  bankAccountId: string;
  metrics: BankFeedSyncResult;
  outboxEventId: string;
}

/**
 * Month-End Close Durable Temporal Workflow
 * Automates the close lifecycle across all 6 sequential accounting steps.
 */
export async function monthEndCloseWorkflow(
  input: MonthEndCloseActivityInput
): Promise<MonthEndCloseWorkflowOutput> {
  // Step 1: Preconditions validation
  const precondition = await validatePeriodPreconditionsActivity(input);
  if (!precondition.ready) {
    throw new Error(`Period ${input.periodId} preconditions not met. Open items count: ${precondition.openItemsCount}`);
  }

  // Step 2: Fixed assets straight-line depreciation
  const depreciation = await runDepreciationBatchActivity(input);

  // Step 3: IAS 21 Unrealized foreign exchange revaluation
  const fxRevaluation = await runFxRevaluationBatchActivity(input);

  // Step 4: UAE VAT 201 Preliminary return generation
  const vatDraft = await generateVatReturnDraftActivity(input);

  // Step 5: Hard lock period to close books
  const periodLock = await lockFinancialPeriodActivity(input);

  // Step 6: Emit transactional outbox event
  const outbox = await publishOutboxEventActivity({
    tenantId: input.tenantId,
    eventType: 'PERIOD_CLOSED',
    aggregateType: 'PERIOD',
    aggregateId: input.periodId,
    payload: {
      periodId: input.periodId,
      depreciation,
      fxRevaluation,
      vatDraft,
      lockedAt: periodLock.lockedAt
    }
  });

  return {
    status: 'COMPLETED',
    periodId: input.periodId,
    depreciation,
    fxRevaluation,
    vatDraft,
    periodLock,
    outboxEventId: outbox.eventId
  };
}

/**
 * E-Invoice Transmission & Retry Durable Workflow
 * Transmits UBL 2.1 PINT-AE invoice to accredited ASP with automatic retry on transient error and 10-year archive.
 */
export async function einvoiceRetryWorkflow(
  input: EinvoiceTransmissionInput
): Promise<EinvoiceWorkflowOutput> {
  // Step 1: Validate UBL XML schema
  const validation = await validatePintAeUblActivity(input);
  if (!validation.isValid) {
    await publishOutboxEventActivity({
      tenantId: input.tenantId,
      eventType: 'EINVOICE_SCHEMA_REJECTED',
      aggregateType: 'INVOICE',
      aggregateId: input.invoiceId,
      payload: { errors: validation.errors }
    });

    return {
      status: 'REJECTED',
      invoiceId: input.invoiceId
    };
  }

  // Step 2: Transmit to ASP Sandbox with retry policy
  const transmission = await transmitToAspSandboxActivity(input);

  if (transmission.status === 'ACCEPTED') {
    // Step 3: Archive for 10-year immutable audit retention (UAE statutory mandate)
    const archive = await archiveToTenYearStoreActivity({
      invoiceId: input.invoiceId,
      ublXml: input.ublXml,
      archiveHash: transmission.archiveHash
    });

    // Step 4: Publish Outbox Event
    const outbox = await publishOutboxEventActivity({
      tenantId: input.tenantId,
      eventType: 'EINVOICE_CLEARED',
      aggregateType: 'INVOICE',
      aggregateId: input.invoiceId,
      payload: {
        transmissionId: transmission.transmissionId,
        archiveId: archive.archiveId,
        retentionUntil: archive.retentionUntil
      }
    });

    return {
      status: 'ACCEPTED',
      invoiceId: input.invoiceId,
      transmissionId: transmission.transmissionId,
      archiveId: archive.archiveId,
      outboxEventId: outbox.eventId
    };
  }

  return {
    status: 'REJECTED',
    invoiceId: input.invoiceId
  };
}

/**
 * Bank Feed Sync Durable Temporal Workflow
 * Coordinates bank aggregator transaction polling, automated reconciliation matching, and event dispatch.
 */
export async function bankFeedSyncWorkflow(
  input: BankFeedSyncInput
): Promise<BankSyncWorkflowOutput> {
  // Step 1: Ingest and match statement lines
  const metrics = await fetchAndMatchBankFeedActivity(input);

  // Step 2: Publish Outbox Event
  const outbox = await publishOutboxEventActivity({
    tenantId: input.tenantId,
    eventType: 'BANK_FEED_SYNC_COMPLETED',
    aggregateType: 'BANK_ACCOUNT',
    aggregateId: input.bankAccountId,
    payload: {
      metrics
    }
  });

  return {
    status: 'COMPLETED',
    tenantId: input.tenantId,
    bankAccountId: input.bankAccountId,
    metrics,
    outboxEventId: outbox.eventId
  };
}

export interface WebhookWorkflowOutput {
  status: 'DELIVERED' | 'FAILED_SSRF' | 'FAILED';
  statusCode?: number;
  signature?: string;
  outboxEventId?: string;
  error?: string;
}

/**
 * Webhook Dispatch Durable Temporal Workflow
 * Delivers signed HMAC webhooks with SSRF protection, exponential backoff retries, and outbox event audit.
 */
export async function webhookDispatchWorkflow(
  input: WebhookDispatchInput
): Promise<WebhookWorkflowOutput> {
  try {
    const result = await dispatchWebhookActivity(input);
    const outbox = await publishOutboxEventActivity({
      tenantId: input.tenantId,
      eventType: 'WEBHOOK_DELIVERED',
      aggregateType: 'WEBHOOK',
      aggregateId: input.webhookUrl,
      payload: {
        eventType: input.eventType,
        signature: result.signature,
        statusCode: result.statusCode
      }
    });

    return {
      status: 'DELIVERED',
      statusCode: result.statusCode,
      signature: result.signature,
      outboxEventId: outbox.eventId
    };
  } catch (err: any) {
    const msg = err.cause?.message || err.message || '';
    if (msg.includes('SSRF_VIOLATION') || err.type === 'SSRF_VIOLATION' || err.cause?.type === 'SSRF_VIOLATION') {
      return {
        status: 'FAILED_SSRF',
        error: msg
      };
    }
    throw err;
  }
}
