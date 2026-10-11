/**
 * Integration Contracts for External Providers
 * 
 * Rules:
 * 1. All external integrations MUST sit behind these interfaces.
 * 2. Real implementations make network requests to sandboxes/production endpoints based on env config.
 * 3. Mocks are ONLY allowed in unit and contract tests.
 * 4. Zero-float money: All amounts are BigInt minor units (fils/cents).
 */

export interface EInvoiceTransmissionParams {
  tenantId: string;
  invoiceId: string;
  invoiceNumber: string;
  ublXml: string;
  idempotencyKey?: string;
}

export interface EInvoiceTransmissionResult {
  transmissionId: string;
  status: 'ACCEPTED' | 'REJECTED' | 'TRANSIENT_ERROR';
  mlsStatusCode: 'AP' | 'RE' | 'IP'; // Accepted | Rejected | In-Process
  clearanceReference?: string;
  rejectionReason?: string;
  timestamp: string;
  archiveHash: string;
}

export interface EInvoiceClearanceStatus {
  transmissionId: string;
  status: 'ACCEPTED' | 'REJECTED' | 'IN_PROCESS';
  clearanceReference?: string;
  clearedAt?: string;
  rejectionReason?: string;
}

export interface EInvoicingAspClient {
  transmitInvoice(params: EInvoiceTransmissionParams): Promise<EInvoiceTransmissionResult>;
  checkClearanceStatus(transmissionId: string): Promise<EInvoiceClearanceStatus>;
  downloadSignedUbl(transmissionId: string): Promise<string>;
}

export interface AggregatorAccount {
  accountId: string;
  accountNumber: string;
  iban: string;
  bankName: string;
  currency: string;
  balanceMinorUnits: bigint; // fils
  lastSyncedAt: string;
}

export interface AggregatorTransaction {
  transactionId: string;
  accountId: string;
  bookingDate: string;
  valueDate: string;
  amountMinorUnits: bigint; // fils
  currency: string;
  direction: 'CREDIT' | 'DEBIT';
  reference: string;
  narrative: string;
  counterpartyName?: string;
  counterpartyIban?: string;
}

export interface BankAggregatorClient {
  listAccounts(tenantId: string): Promise<AggregatorAccount[]>;
  getTransactions(accountId: string, fromDate: string, toDate: string): Promise<AggregatorTransaction[]>;
  verifyWebhookSignature(payload: string, signature: string, secret?: string): boolean;
}

export interface CreatePaymentIntentParams {
  tenantId: string;
  amountFils: bigint; // AED minor units (fils)
  currency: string; // e.g. 'aed'
  invoiceId?: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResult {
  intentId: string;
  clientSecret: string;
  amountFils: bigint;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'succeeded' | 'canceled';
  createdAt: string;
}

export interface PaymentCaptureResult {
  intentId: string;
  status: 'succeeded' | 'failed';
  amountCapturedFils: bigint;
  capturedAt: string;
}

export interface PaymentRefundResult {
  refundId: string;
  intentId: string;
  amountRefundedFils: bigint;
  status: 'succeeded' | 'failed' | 'pending';
}

export interface PaymentGatewayClient {
  createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult>;
  capturePayment(intentId: string): Promise<PaymentCaptureResult>;
  refundPayment(intentId: string, amountFils?: bigint): Promise<PaymentRefundResult>;
  verifyWebhookSignature(payload: string, signatureHeader: string, secret?: string): boolean;
}
