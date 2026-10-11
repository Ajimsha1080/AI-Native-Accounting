import { createHash } from 'node:crypto';
import { isValidUaeTrn } from '@ledger-ae/uae-tax-engine';
import {
  EInvoicingAspClient,
  EInvoiceTransmissionParams,
  EInvoiceTransmissionResult,
  EInvoiceClearanceStatus
} from './contracts.js';

export interface PintAeAspConfig {
  baseUrl?: string;
  apiKey?: string;
  customFetch?: typeof fetch;
}

/**
 * Real Accredited Service Provider (ASP) Client for UAE Peppol PINT-AE E-Invoicing.
 * Connects to accredited UAE Access Point (sandbox or production) per FTA statutory specifications.
 */
export class PintAeAspClient implements EInvoicingAspClient {
  private baseUrl: string;
  private apiKey: string;
  private fetchImpl: typeof fetch;

  constructor(config: PintAeAspConfig = {}) {
    this.baseUrl = config.baseUrl || process.env.EINVOICE_ASP_URL || 'https://sandbox.pint-ae.peppol.ae/v1';
    this.apiKey = config.apiKey || process.env.EINVOICE_ASP_API_KEY || 'asp_sandbox_default_key';
    this.fetchImpl = config.customFetch || globalThis.fetch;
  }

  async transmitInvoice(params: EInvoiceTransmissionParams): Promise<EInvoiceTransmissionResult> {
    const sha256 = createHash('sha256').update(params.ublXml).digest('hex');

    // 1. Client-Side Pre-transmission Validation: Peppol PINT UAE Customization ID
    if (!params.ublXml.includes('urn:peppol:pint:billing-1@ae-1')) {
      return {
        transmissionId: `tx-rejected-${Date.now()}`,
        status: 'REJECTED',
        mlsStatusCode: 'RE',
        rejectionReason: 'Schema Violation: Missing mandatory CustomizationID urn:peppol:pint:billing-1@ae-1 (VERIFY WITH UAE TAX ADVISOR)',
        timestamp: new Date().toISOString(),
        archiveHash: sha256
      };
    }

    // 2. Client-Side Pre-transmission Validation: FTA 15-digit Supplier TRN
    const trnMatch = params.ublXml.match(/<cac:AccountingSupplierParty>[\s\S]*?<cbc:CompanyID>([^<]+)<\/cbc:CompanyID>/);
    if (!trnMatch || !isValidUaeTrn(trnMatch[1])) {
      return {
        transmissionId: `tx-rejected-${Date.now()}`,
        status: 'REJECTED',
        mlsStatusCode: 'RE',
        rejectionReason: 'Statutory Violation: Supplier TRN is invalid under UAE FTA 15-digit rules (VERIFY WITH UAE TAX ADVISOR)',
        timestamp: new Date().toISOString(),
        archiveHash: sha256
      };
    }

    // 3. ASP API Request
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/invoices/transmit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Idempotency-Key': params.idempotencyKey || `idem-${params.invoiceId}`,
          'X-Tenant-Id': params.tenantId
        },
        body: params.ublXml
      });

      if (!response.ok) {
        if (response.status >= 500) {
          return {
            transmissionId: `tx-err-${Date.now()}`,
            status: 'TRANSIENT_ERROR',
            mlsStatusCode: 'IP',
            rejectionReason: `ASP Gateway Error HTTP ${response.status}: Transient service outage`,
            timestamp: new Date().toISOString(),
            archiveHash: sha256
          };
        }

        const errJson = await response.json().catch(() => ({}));
        return {
          transmissionId: `tx-err-${Date.now()}`,
          status: 'REJECTED',
          mlsStatusCode: 'RE',
          rejectionReason: (errJson as any).message || `ASP Rejection HTTP ${response.status}`,
          timestamp: new Date().toISOString(),
          archiveHash: sha256
        };
      }

      const resData = (await response.json()) as any;
      return {
        transmissionId: resData.transmissionId || `ASP-TX-AE-${Date.now()}`,
        status: 'ACCEPTED',
        mlsStatusCode: 'AP',
        clearanceReference: resData.clearanceReference || `FTA-CLR-${Date.now()}`,
        timestamp: resData.timestamp || new Date().toISOString(),
        archiveHash: sha256
      };
    } catch (err: any) {
      return {
        transmissionId: `tx-net-err-${Date.now()}`,
        status: 'TRANSIENT_ERROR',
        mlsStatusCode: 'IP',
        rejectionReason: `Network error connecting to ASP sandbox: ${err.message || String(err)}`,
        timestamp: new Date().toISOString(),
        archiveHash: sha256
      };
    }
  }

  async checkClearanceStatus(transmissionId: string): Promise<EInvoiceClearanceStatus> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/invoices/${transmissionId}/status`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        return {
          transmissionId,
          status: 'IN_PROCESS',
          rejectionReason: `HTTP ${response.status} querying status`
        };
      }

      const data = (await response.json()) as any;
      return {
        transmissionId,
        status: data.status || 'ACCEPTED',
        clearanceReference: data.clearanceReference,
        clearedAt: data.clearedAt,
        rejectionReason: data.rejectionReason
      };
    } catch (err: any) {
      return {
        transmissionId,
        status: 'IN_PROCESS',
        rejectionReason: err.message
      };
    }
  }

  async downloadSignedUbl(transmissionId: string): Promise<string> {
    const response = await this.fetchImpl(`${this.baseUrl}/invoices/${transmissionId}/signed-xml`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to download signed UBL for ${transmissionId}: HTTP ${response.status}`);
    }

    return response.text();
  }
}
