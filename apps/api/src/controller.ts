import {
  JournalEntryCandidate,
  validateLedgerInvariants,
  computeVoucherHash,
  PeriodManager,
  PeriodLockedException
} from '@ledger-ae/ledger-core';
import { calculateVat201Return, VatLineInput } from '@ledger-ae/uae-tax-engine';
import { generateUblPintaXml, SandboxAspAdapter, PintaInvoiceData } from '@ledger-ae/ubl-pinta-generator';


import { createHmac } from 'node:crypto';

export interface PostJournalDto {
  entry: JournalEntryCandidate;
  tenantId?: string;
  idempotencyKey?: string;
}

export interface WebhookEvent {
  eventId: string;
  eventType: string;
  tenantId: string;
  payload: Record<string, unknown>;
  timestamp: string;
  signature: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
  isIdempotentReplay?: boolean;
}

/**
 * Core NestJS-ready Modular API Controller Service for LedgerAE.
 * Exposes type-safe endpoints for ledger postings, VAT 201 generation, and e-invoicing.
 */
export class LedgerApiController {
  private periodManager = new PeriodManager();
  private aspAdapter = new SandboxAspAdapter();
  private idempotencyCache: Map<string, ApiResponse<{ voucherNumber: string; hash: string }>> = new Map();
  private webhookSubscriptions: { url: string; secret: string; events: string[] }[] = [];
  public dispatchedWebhooks: WebhookEvent[] = [];

  constructor() {
    // Default open period for current operations
    this.periodManager.registerPeriod({
      periodId: 'period-2026-01',
      entityId: 'ent-mainland-01',
      fiscalYear: 2026,
      periodNumber: 1,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      status: (this.periodManager as any).PeriodLockStatus?.OPEN ?? 'OPEN'
    });
  }

  registerWebhook(subscription: { url: string; secret: string; events: string[] }) {
    this.webhookSubscriptions.push(subscription);
  }

  private dispatchWebhook(eventType: string, tenantId: string, payload: Record<string, unknown>) {
    const timestamp = new Date().toISOString();
    const eventId = `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    for (const sub of this.webhookSubscriptions) {
      if (sub.events.includes(eventType) || sub.events.includes('*')) {
        const payloadString = JSON.stringify({ eventId, eventType, tenantId, payload, timestamp });
        const signature = createHmac('sha256', sub.secret).update(payloadString).digest('hex');

        this.dispatchedWebhooks.push({
          eventId,
          eventType,
          tenantId,
          payload,
          timestamp,
          signature
        });
      }
    }
  }

  /**
   * Endpoint: POST /api/v1/ledger/entries
   * Supports Idempotency-Key header to prevent duplicate double-entry postings.
   */
  async postJournalEntry(dto: PostJournalDto): Promise<ApiResponse<{ voucherNumber: string; hash: string }>> {
    try {
      // 1. Idempotency Key Replay Check
      if (dto.idempotencyKey) {
        const cached = this.idempotencyCache.get(dto.idempotencyKey);
        if (cached) {
          return {
            ...cached,
            isIdempotentReplay: true
          };
        }
      }

      // 2. Tenant Validation
      const tenantId = dto.tenantId ?? dto.entry?.tenantId;
      if (!tenantId || tenantId.trim() === '') {
        return {
          success: false,
          error: 'Missing mandatory Tenant ID (x-tenant-id header required).',
          timestamp: new Date().toISOString()
        };
      }

      // 3. Period Lock Check
      this.periodManager.assertPostingPermitted(dto.entry.periodId);

      // 4. Invariant Math Validation (Debits == Credits, BigInt minor units)
      const validation = validateLedgerInvariants(dto.entry);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Invariant Validation Failed: ${validation.errors.join('; ')}`,
          timestamp: new Date().toISOString()
        };
      }

      // 5. Compute Merkle Voucher Hash
      const voucherHash = computeVoucherHash(dto.entry);

      const response: ApiResponse<{ voucherNumber: string; hash: string }> = {
        success: true,
        data: {
          voucherNumber: dto.entry.entryNumber,
          hash: voucherHash
        },
        timestamp: new Date().toISOString()
      };

      // Cache for idempotency
      if (dto.idempotencyKey) {
        this.idempotencyCache.set(dto.idempotencyKey, response);
      }

      // Dispatch Webhook
      this.dispatchWebhook('journal.posted', tenantId, {
        voucherNumber: dto.entry.entryNumber,
        voucherHash,
        periodId: dto.entry.periodId
      });

      return response;
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Internal ledger error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Endpoint: GET /api/v1/tax/vat201
   */
  async getVat201Return(trn: string, period: string, lines: VatLineInput[]): Promise<ApiResponse<any>> {
    try {
      const vatReturn = calculateVat201Return(trn, period, lines);
      return {
        success: true,
        data: vatReturn,
        timestamp: new Date().toISOString()
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Endpoint: POST /api/v1/einvoicing/transmit
   */
  async transmitEInvoice(invoice: PintaInvoiceData): Promise<ApiResponse<any>> {
    try {
      // 1. Generate UBL 2.1 XML
      const ublXml = generateUblPintaXml(invoice);

      // 2. Transmit via pluggable ASP Adapter
      const aspResponse = await this.aspAdapter.transmitInvoice(ublXml);

      return {
        success: aspResponse.status === 'ACCEPTED',
        data: {
          transmissionId: aspResponse.transmissionId,
          mlsStatusCode: aspResponse.mlsStatusCode,
          clearanceReference: aspResponse.clearanceReference,
          rejectionReason: aspResponse.rejectionReason
        },
        timestamp: new Date().toISOString()
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}
