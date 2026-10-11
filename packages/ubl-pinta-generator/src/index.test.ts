import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateUblPintaXml,
  parseReceivedUblPintaXml,
  PintaInvoiceData
} from './generator.js';
import {
  SandboxAspAdapter,
  PeppolMlsStatus,
  EinvoicingTransmissionQueue,
  EinvoiceArchiveRepository
} from './asp-adapter.js';

describe('Milestone 8: UAE E-Invoicing (Peppol Five-Corner Model, PINT-AE UBL 2.1 & ASP Adapter)', () => {
  const sampleInvoice: PintaInvoiceData = {
    invoiceNumber: 'INV-2026-DXB-001',
    issueDate: '2026-02-15',
    currencyCode: 'AED',
    supplier: {
      name: 'Dubai Cloud Technologies LLC',
      trn: '100234567800003',
      streetName: 'Sheikh Zayed Road',
      city: 'Dubai',
      emirate: 'Dubai',
      countryCode: 'AE'
    },
    customer: {
      name: 'Emirates Retail Holdings PJSC',
      trn: '100987654321001',
      streetName: 'Corniche Road',
      city: 'Abu Dhabi',
      emirate: 'Abu Dhabi',
      countryCode: 'AE'
    },
    subtotalFils: 1000000n, // AED 10,000.00
    vatTotalFils: 50000n,    // AED 500.00 (5%)
    grandTotalFils: 1050000n, // AED 10,500.00
    lines: [
      {
        id: '1',
        description: 'Cloud Server Infrastructure Hosting',
        quantity: 1,
        unitPriceFils: 1000000n,
        lineExtensionAmountFils: 1000000n,
        vatRatePercent: 5,
        vatAmountFils: 50000n,
        taxCategoryCode: 'S'
      }
    ]
  };

  describe('PINT-AE UBL 2.1 Generation & Parsing', () => {
    test('Generates valid OASIS UBL 2.1 Commercial Invoice (380)', () => {
      const xml = generateUblPintaXml(sampleInvoice);

      // Verify PINT CustomizationID & ProfileID
      assert.match(xml, /<cbc:CustomizationID>urn:peppol:pint:billing-1@ae-1<\/cbc:CustomizationID>/);
      assert.match(xml, /<cbc:ProfileID>urn:peppol:bis:billing<\/cbc:ProfileID>/);
      assert.match(xml, /<cbc:ID>INV-2026-DXB-001<\/cbc:ID>/);
      assert.match(xml, /<cbc:InvoiceTypeCode>380<\/cbc:InvoiceTypeCode>/);
      assert.match(xml, /<cbc:DocumentCurrencyCode>AED<\/cbc:DocumentCurrencyCode>/);

      // Verify Parties & TRNs
      assert.match(xml, /<cbc:CompanyID>100234567800003<\/cbc:CompanyID>/);
      assert.match(xml, /<cbc:CompanyID>100987654321001<\/cbc:CompanyID>/);

      // Verify Monetary Totals
      assert.match(xml, /<cbc:LineExtensionAmount currencyID="AED">10000\.00<\/cbc:LineExtensionAmount>/);
      assert.match(xml, /<cbc:TaxAmount currencyID="AED">500\.00<\/cbc:TaxAmount>/);
      assert.match(xml, /<cbc:PayableAmount currencyID="AED">10500\.00<\/cbc:PayableAmount>/);
    });

    test('Generates valid Peppol PINT-AE Credit Note (381) with BillingReference', () => {
      const creditNote: PintaInvoiceData = {
        ...sampleInvoice,
        invoiceNumber: 'CN-2026-DXB-001',
        typeCode: '381',
        originalInvoiceReference: 'INV-2026-DXB-001',
        subtotalFils: 200000n, // AED 2,000.00
        vatTotalFils: 10000n,  // AED 100.00
        grandTotalFils: 210000n,
        lines: [
          {
            id: '1',
            description: 'Credit adjustment for service SLA rebate',
            quantity: 1,
            unitPriceFils: 200000n,
            lineExtensionAmountFils: 200000n,
            vatRatePercent: 5,
            vatAmountFils: 10000n,
            taxCategoryCode: 'S'
          }
        ]
      };

      const xml = generateUblPintaXml(creditNote);
      assert.match(xml, /<CreditNote/);
      assert.match(xml, /<cbc:InvoiceTypeCode>381<\/cbc:InvoiceTypeCode>/);
      assert.match(xml, /<cac:BillingReference>[\s\S]*?<cbc:ID>INV-2026-DXB-001<\/cbc:ID>/);
      assert.match(xml, /<cbc:PayableAmount currencyID="AED">2100\.00<\/cbc:PayableAmount>/);
    });

    test('Parses incoming Peppol PINT-AE XML document into typed invoice structure', () => {
      const xml = generateUblPintaXml(sampleInvoice);
      const parsed = parseReceivedUblPintaXml(xml);

      assert.equal(parsed.invoiceNumber, 'INV-2026-DXB-001');
      assert.equal(parsed.typeCode, '380');
      assert.equal(parsed.supplierName, 'Dubai Cloud Technologies LLC');
      assert.equal(parsed.supplierTrn, '100234567800003');
      assert.equal(parsed.customerTrn, '100987654321001');
      assert.equal(parsed.grandTotalFils, 1050000n);
      assert.equal(parsed.vatTotalFils, 50000n);
      assert.equal(parsed.lineItemsCount, 1);
    });
  });

  describe('Sandbox ASP Adapter & Failure/Retry Paths', () => {
    test('ASP Sandbox accepts compliant invoice and returns Message Level Response (MLS)', async () => {
      const xml = generateUblPintaXml(sampleInvoice);
      const adapter = new SandboxAspAdapter();

      const response = await adapter.transmitInvoice({
        invoiceId: 'inv-01',
        ublXml: xml,
        idempotencyKey: 'idemp-01',
        tenantId: 'tenant-dxb-01'
      });

      assert.equal(response.status, PeppolMlsStatus.ACCEPTED);
      assert.equal(response.mlsStatusCode, 'AP');
      assert.ok(response.clearanceReference);
      assert.match(response.clearanceReference!, /FTA-CLEARANCE-UUID/);
    });

    test('Permanent Schema Rejection: Rejects invoice with invalid CustomizationID without retry', async () => {
      const invalidXml = `<Invoice><cbc:CustomizationID>urn:invalid</cbc:CustomizationID></Invoice>`;
      const adapter = new SandboxAspAdapter();
      const queue = new EinvoicingTransmissionQueue(adapter, 3);

      const queued = await queue.submitInvoice({
        invoiceId: 'inv-bad',
        ublXml: invalidXml,
        idempotencyKey: 'idemp-bad',
        tenantId: 'tenant-dxb-01'
      });

      assert.equal(queued.status, 'PERMANENT_REJECTED');
      assert.equal(queued.attempts, 1); // No retries for permanent schema error
      assert.match(queued.errorMessage!, /Missing mandatory CustomizationID/);
    });

    test('Failure & Retry Path: Retries transient outage and exhausts to Dead Letter Queue (DLQ)', async () => {
      const xml = generateUblPintaXml(sampleInvoice);
      const adapter = new SandboxAspAdapter();
      adapter.simulateNetworkFailure = true; // Simulate HTTP 503 gateway outage

      const queue = new EinvoicingTransmissionQueue(adapter, 3); // Max 3 attempts

      // Attempt 1
      const queued = await queue.submitInvoice({
        invoiceId: 'inv-transient-01',
        ublXml: xml,
        idempotencyKey: 'idemp-retry-01',
        tenantId: 'tenant-dxb-01'
      });
      assert.equal(queued.status, 'RETRYING');
      assert.equal(queued.attempts, 1);

      // Attempt 2
      await queue.processQueueItem(queued);
      assert.equal(queued.status, 'RETRYING');
      assert.equal(queued.attempts, 2);

      // Attempt 3 (Exhausts retries -> Dead Letter Queue)
      await queue.processQueueItem(queued);
      assert.equal(queued.status, 'DEAD_LETTER_QUEUE');
      assert.equal(queued.attempts, 3);
      assert.match(queued.errorMessage!, /Exhausted 3 attempts/);

      // Inspect DLQ
      const dlq = queue.getDeadLetterQueue();
      assert.equal(dlq.length, 1);
      assert.equal(dlq[0].request.invoiceId, 'inv-transient-01');
    });

    test('Transient Outage Recovery: Succeeds on retry when network clears', async () => {
      const xml = generateUblPintaXml(sampleInvoice);
      const adapter = new SandboxAspAdapter();
      adapter.simulateNetworkFailure = true; // Outage initially

      const queue = new EinvoicingTransmissionQueue(adapter, 3);
      const queued = await queue.submitInvoice({
        invoiceId: 'inv-recover-01',
        ublXml: xml,
        idempotencyKey: 'idemp-rec-01',
        tenantId: 'tenant-dxb-01'
      });
      assert.equal(queued.status, 'RETRYING');

      // Network clears
      adapter.simulateNetworkFailure = false;
      await queue.processQueueItem(queued);

      assert.equal(queued.status, 'SUCCEEDED');
      assert.equal(queued.attempts, 2);
      assert.equal(queued.lastResponse?.status, PeppolMlsStatus.ACCEPTED);
    });
  });

  describe('Mandatory 10-Year Immutable E-Invoice Archive (Non-Repudiation)', () => {
    test('Archives e-invoice with SHA-256 hash, 10-year retention date, and verifies cryptographic integrity', () => {
      EinvoiceArchiveRepository.resetForTesting();
      const xml = generateUblPintaXml(sampleInvoice);

      const archived = EinvoiceArchiveRepository.archiveInvoice({
        invoiceNumber: sampleInvoice.invoiceNumber,
        tenantId: 'tenant-dxb-01',
        supplierTrn: sampleInvoice.supplier.trn,
        customerTrn: sampleInvoice.customer.trn,
        issueDate: sampleInvoice.issueDate,
        rawUblXml: xml,
        clearanceReference: 'FTA-CLEARANCE-UUID-XYZ123'
      });

      assert.ok(archived.archiveId);
      assert.equal(archived.invoiceNumber, 'INV-2026-DXB-001');
      assert.ok(archived.sha256Hash.length === 64); // Valid SHA-256 hex string

      // Verify 10 years retention window
      const archiveYear = new Date(archived.archivedAt).getFullYear();
      const retentionYear = new Date(archived.retentionUntil).getFullYear();
      assert.equal(retentionYear, archiveYear + 10);

      // Verify cryptographic non-repudiation integrity
      const isIntegrityValid = EinvoiceArchiveRepository.verifyArchiveIntegrity(sampleInvoice.invoiceNumber);
      assert.equal(isIntegrityValid, true);

      // Retrieve archived record
      const retrieved = EinvoiceArchiveRepository.getArchivedInvoice(sampleInvoice.invoiceNumber);
      assert.ok(retrieved);
      assert.equal(retrieved.clearanceReference, 'FTA-CLEARANCE-UUID-XYZ123');
    });
  });
});
