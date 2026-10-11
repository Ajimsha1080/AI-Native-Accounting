import { Connection, Client } from '@temporalio/client';
import { createActivities, Activities } from './activities.js';
import {
  monthEndCloseWorkflow,
  einvoiceRetryWorkflow,
  bankFeedSyncWorkflow,
  MonthEndCloseWorkflowOutput,
  EinvoiceWorkflowOutput,
  BankSyncWorkflowOutput
} from './workflows.js';

export const DEFAULT_TASK_QUEUE = 'ledger-ae-core-tasks';

export interface TemporalClientConfig {
  connection?: Connection;
  namespace?: string;
}

/**
 * Temporal Client Helper to trigger typed workflows with idempotency and tracking.
 */
export class AccountingTemporalClient {
  private client: Client | null = null;

  constructor(client?: Client) {
    if (client) {
      this.client = client;
    }
  }

  /**
   * Triggers the month-end close workflow.
   */
  async triggerMonthEndClose(
    tenantId: string,
    periodId: string,
    workflowId?: string
  ): Promise<string> {
    const id = workflowId || `close-${tenantId}-${periodId}-${Date.now()}`;
    if (this.client) {
      const handle = await this.client.workflow.start(monthEndCloseWorkflow, {
        taskQueue: DEFAULT_TASK_QUEUE,
        workflowId: id,
        args: [{ tenantId, periodId }]
      });
      return handle.workflowId;
    }
    return id;
  }

  /**
   * Triggers an e-invoice transmission with retries.
   */
  async triggerEinvoiceRetry(
    tenantId: string,
    invoiceId: string,
    ublXml: string,
    workflowId?: string
  ): Promise<string> {
    const id = workflowId || `einvoice-${invoiceId}-${Date.now()}`;
    if (this.client) {
      const handle = await this.client.workflow.start(einvoiceRetryWorkflow, {
        taskQueue: DEFAULT_TASK_QUEUE,
        workflowId: id,
        args: [{ tenantId, invoiceId, ublXml }]
      });
      return handle.workflowId;
    }
    return id;
  }

  /**
   * Triggers an automated bank feed sync and reconciliation run.
   */
  async triggerBankFeedSync(
    tenantId: string,
    bankAccountId: string,
    feedSource: 'LEAN_TECHNOLOGIES' | 'SWIFT_MT940' | 'ENBD_DIRECT' = 'LEAN_TECHNOLOGIES',
    workflowId?: string
  ): Promise<string> {
    const id = workflowId || `banksync-${bankAccountId}-${Date.now()}`;
    if (this.client) {
      const handle = await this.client.workflow.start(bankFeedSyncWorkflow, {
        taskQueue: DEFAULT_TASK_QUEUE,
        workflowId: id,
        args: [{ tenantId, bankAccountId, feedSource }]
      });
      return handle.workflowId;
    }
    return id;
  }
}

/**
 * In-process Workflow Test Runner
 * Allows deterministic integration testing of workflow logic without a live Temporal cluster.
 */
export class WorkflowTestRunner {
  static async runMonthEndClose(
    tenantId: string,
    periodId: string,
    customActivities?: Partial<Activities>
  ): Promise<MonthEndCloseWorkflowOutput> {
    const acts = {
      ...createActivities(),
      ...(customActivities || {})
    };

    const precondition = await acts.validatePeriodPreconditionsActivity({ tenantId, periodId });
    if (!precondition.ready) {
      throw new Error(`Period preconditions failed with ${precondition.openItemsCount} open items`);
    }

    const depreciation = await acts.runDepreciationBatchActivity({ tenantId, periodId });
    const fxRevaluation = await acts.runFxRevaluationBatchActivity({ tenantId, periodId });
    const vatDraft = await acts.generateVatReturnDraftActivity({ tenantId, periodId });
    const periodLock = await acts.lockFinancialPeriodActivity({ tenantId, periodId });
    const outbox = await acts.publishOutboxEventActivity({
      tenantId,
      eventType: 'PERIOD_CLOSED',
      aggregateType: 'PERIOD',
      aggregateId: periodId,
      payload: { periodId, depreciation, fxRevaluation, vatDraft, lockedAt: periodLock.lockedAt }
    });

    return {
      status: 'COMPLETED',
      periodId,
      depreciation,
      fxRevaluation,
      vatDraft,
      periodLock,
      outboxEventId: outbox.eventId
    };
  }

  static async runEinvoiceRetry(
    tenantId: string,
    invoiceId: string,
    ublXml: string,
    customActivities?: Partial<Activities>
  ): Promise<EinvoiceWorkflowOutput> {
    const acts = {
      ...createActivities(),
      ...(customActivities || {})
    };

    const validation = await acts.validatePintAeUblActivity({ tenantId, invoiceId, ublXml });
    if (!validation.isValid) {
      return { status: 'REJECTED', invoiceId };
    }

    let transmission: any;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        transmission = await acts.transmitToAspSandboxActivity({ tenantId, invoiceId, ublXml });
        break;
      } catch (err) {
        if (attempts >= maxAttempts) {
          return { status: 'FAILED_DLQ', invoiceId };
        }
      }
    }

    if (transmission && transmission.status === 'ACCEPTED') {
      const archive = await acts.archiveToTenYearStoreActivity({
        invoiceId,
        ublXml,
        archiveHash: transmission.archiveHash
      });
      const outbox = await acts.publishOutboxEventActivity({
        tenantId,
        eventType: 'EINVOICE_CLEARED',
        aggregateType: 'INVOICE',
        aggregateId: invoiceId,
        payload: { transmissionId: transmission.transmissionId, archiveId: archive.archiveId }
      });

      return {
        status: 'ACCEPTED',
        invoiceId,
        transmissionId: transmission.transmissionId,
        archiveId: archive.archiveId,
        outboxEventId: outbox.eventId
      };
    }

    return { status: 'REJECTED', invoiceId };
  }
}
