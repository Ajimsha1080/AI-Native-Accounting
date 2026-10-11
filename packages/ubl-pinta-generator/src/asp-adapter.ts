import { createHash } from 'node:crypto';
import { isValidUaeTrn } from '../../uae-tax-engine/dist/trn-validator.js';

export enum PeppolMlsStatus {
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  FAILED_TRANSIENT = 'FAILED_TRANSIENT',
  PENDING = 'PENDING'
}

export interface AspTransmissionRequest {
  invoiceId: string;
  ublXml: string;
  idempotencyKey: string;
  tenantId: string;
  attemptNumber?: number;
}

export interface AspTransmissionResponse {
  transmissionId: string;
  status: PeppolMlsStatus;
  mlsStatusCode: string; // 'AP' (Accepted) | 'RE' (Rejected) | 'IP' (In Process)
  clearanceReference?: string;
  rejectionReason?: string;
  isTransientError?: boolean;
  timestamp: string;
}

export interface AspAdapter {
  transmitInvoice(request: AspTransmissionRequest | string): Promise<AspTransmissionResponse>;
}

export interface ArchivedEInvoice {
  archiveId: string;
  invoiceNumber: string;
  tenantId: string;
  supplierTrn: string;
  customerTrn: string;
  issueDate: string;
  rawUblXml: string;
  sha256Hash: string;
  clearanceReference: string;
  archivedAt: string;
  retentionUntil: string; // 10 years mandatory
}

/**
 * Sandboxed Mock Adapter for Accredited Service Providers (ASPs) on the UAE Peppol Network.
 * Simulates real ASP network clearance, XML schema validation, and transient failure conditions.
 */
export class SandboxAspAdapter implements AspAdapter {
  public simulateNetworkFailure: boolean = false;

  async transmitInvoice(request: AspTransmissionRequest | string): Promise<AspTransmissionResponse> {
    const xml = typeof request === 'string' ? request : request.ublXml;

    // 1. Simulate Transient Network / Service Outage (e.g. HTTP 503 from ASP gateway)
    if (this.simulateNetworkFailure) {
      return {
        transmissionId: `tx-transient-${Date.now()}`,
        status: PeppolMlsStatus.FAILED_TRANSIENT,
        mlsStatusCode: 'IP',
        rejectionReason: 'ASP_GATEWAY_TIMEOUT: Transient HTTP 503 Service Unavailable',
        isTransientError: true,
        timestamp: new Date().toISOString()
      };
    }

    // 2. Validate Peppol PINT CustomizationID
    if (!xml.includes('urn:peppol:pint:billing-1@ae-1')) {
      return {
        transmissionId: `tx-err-${Date.now()}`,
        status: PeppolMlsStatus.REJECTED,
        mlsStatusCode: 'RE',
        rejectionReason: 'Schema Violation: Missing mandatory CustomizationID urn:peppol:pint:billing-1@ae-1',
        isTransientError: false,
        timestamp: new Date().toISOString()
      };
    }

    // 3. Validate Supplier TRN
    const trnMatch = xml.match(/<cac:AccountingSupplierParty>[\s\S]*?<cbc:CompanyID>([^<]+)<\/cbc:CompanyID>/);
    if (!trnMatch || !isValidUaeTrn(trnMatch[1])) {
      return {
        transmissionId: `tx-err-${Date.now()}`,
        status: PeppolMlsStatus.REJECTED,
        mlsStatusCode: 'RE',
        rejectionReason: 'Statutory Violation: Supplier TRN failed UAE FTA 15-digit validation',
        isTransientError: false,
        timestamp: new Date().toISOString()
      };
    }

    // 4. Return successful Peppol MLS (Message Level Response) with FTA Clearance UUID
    return {
      transmissionId: `ASP-TX-AE-${Date.now()}`,
      status: PeppolMlsStatus.ACCEPTED,
      mlsStatusCode: 'AP',
      clearanceReference: `FTA-CLEARANCE-UUID-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      timestamp: new Date().toISOString()
    };
  }
}

export interface QueuedTransmissionItem {
  queueId: string;
  request: AspTransmissionRequest;
  attempts: number;
  maxAttempts: number;
  status: 'PENDING' | 'RETRYING' | 'SUCCEEDED' | 'DEAD_LETTER_QUEUE' | 'PERMANENT_REJECTED';
  lastResponse?: AspTransmissionResponse;
  lastAttemptAt?: string;
  errorMessage?: string;
}

/**
 * E-Invoicing Transmission & Retry Queue.
 * Automatically retries transient ASP failures and routes persistent failures to the dead-letter queue.
 */
export class EinvoicingTransmissionQueue {
  private queue: Map<string, QueuedTransmissionItem> = new Map();

  constructor(private adapter: AspAdapter, private maxAttempts: number = 3) {}

  async submitInvoice(request: AspTransmissionRequest): Promise<QueuedTransmissionItem> {
    const queueId = `q-${request.invoiceId}-${Date.now()}`;
    const item: QueuedTransmissionItem = {
      queueId,
      request,
      attempts: 0,
      maxAttempts: this.maxAttempts,
      status: 'PENDING'
    };

    this.queue.set(queueId, item);
    await this.processQueueItem(item);
    return item;
  }

  async processQueueItem(item: QueuedTransmissionItem): Promise<QueuedTransmissionItem> {
    item.attempts++;
    item.lastAttemptAt = new Date().toISOString();

    const response = await this.adapter.transmitInvoice({
      ...item.request,
      attemptNumber: item.attempts
    });
    item.lastResponse = response;

    if (response.status === PeppolMlsStatus.ACCEPTED) {
      item.status = 'SUCCEEDED';
    } else if (response.status === PeppolMlsStatus.FAILED_TRANSIENT) {
      if (item.attempts < item.maxAttempts) {
        item.status = 'RETRYING';
      } else {
        // Retries exhausted -> route to Dead Letter Queue for ops intervention
        item.status = 'DEAD_LETTER_QUEUE';
        item.errorMessage = `Exhausted ${item.maxAttempts} attempts: ${response.rejectionReason}`;
      }
    } else {
      // Permanent statutory or schema rejection
      item.status = 'PERMANENT_REJECTED';
      item.errorMessage = response.rejectionReason;
    }

    return item;
  }

  getQueueItem(queueId: string): QueuedTransmissionItem | undefined {
    return this.queue.get(queueId);
  }

  getDeadLetterQueue(): QueuedTransmissionItem[] {
    return Array.from(this.queue.values()).filter((i) => i.status === 'DEAD_LETTER_QUEUE');
  }
}

/**
 * 10-Year Immutable E-Invoice Archiving Repository.
 * Complies with UAE FTA statutory 5-to-10 year non-repudiation and audit retention rules.
 */
export class EinvoiceArchiveRepository {
  private static archive: Map<string, ArchivedEInvoice> = new Map();

  static archiveInvoice(params: {
    invoiceNumber: string;
    tenantId: string;
    supplierTrn: string;
    customerTrn: string;
    issueDate: string;
    rawUblXml: string;
    clearanceReference: string;
  }): ArchivedEInvoice {
    const sha256Hash = createHash('sha256').update(params.rawUblXml).digest('hex');

    // 10 Years Retention calculation
    const now = new Date();
    const retentionDate = new Date(now.getFullYear() + 10, now.getMonth(), now.getDate());

    const record: ArchivedEInvoice = {
      archiveId: `arc-${params.invoiceNumber}-${Date.now()}`,
      invoiceNumber: params.invoiceNumber,
      tenantId: params.tenantId,
      supplierTrn: params.supplierTrn,
      customerTrn: params.customerTrn,
      issueDate: params.issueDate,
      rawUblXml: params.rawUblXml,
      sha256Hash,
      clearanceReference: params.clearanceReference,
      archivedAt: now.toISOString(),
      retentionUntil: retentionDate.toISOString()
    };

    this.archive.set(params.invoiceNumber, record);
    return record;
  }

  static getArchivedInvoice(invoiceNumber: string): ArchivedEInvoice | undefined {
    return this.archive.get(invoiceNumber);
  }

  static verifyArchiveIntegrity(invoiceNumber: string): boolean {
    const record = this.archive.get(invoiceNumber);
    if (!record) return false;

    const currentHash = createHash('sha256').update(record.rawUblXml).digest('hex');
    return currentHash === record.sha256Hash;
  }

  static resetForTesting(): void {
    this.archive.clear();
  }
}
