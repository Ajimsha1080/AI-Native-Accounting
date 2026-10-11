import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentIntelligenceService } from './document-intelligence.js';
import {
  AccountingAssistantService,
  QueryCitation
} from './assistant.js';

describe('AI Layer: Document Intelligence & UAE Invoice Extraction', () => {
  const bilingualOcrSample = `
    TAX INVOICE / فاتورة ضريبية
    Al Futtaim Group LLC
    TRN: 100234567800003
    Invoice No / رقم الفاتورة: INV-2026-9021
    Date: 2026-02-15
    Description: Office IT Infrastructure Setup
    Total / المجموع: AED 21,000.00
  `;

  test('Extracts UAE TRN, Invoice number, and amounts into structured data', () => {
    const doc = DocumentIntelligenceService.processOcrText('doc-uuid-01', bilingualOcrSample);

    assert.equal(doc.vendorTrn, '100234567800003');
    assert.equal(doc.isTrnValid, true);
    assert.equal(doc.invoiceNumber, 'INV-2026-9021');
    assert.equal(doc.invoiceDate, '2026-02-15');
    assert.equal(doc.totalFils, 2100000n); // AED 21,000.00
    assert.equal(doc.lines[0].proposedTaxCode, 'SR_5');
  });
});

describe('AI Layer: Accounting Copilot (Deterministic Queries First)', () => {
  const citations: QueryCitation[] = [
    {
      voucherNumber: 'JV-2026-001',
      postingDate: '2026-01-10',
      accountCode: '40100',
      amountFils: 5000000n, // AED 50,000.00
      memo: 'Enterprise License Sale'
    },
    {
      voucherNumber: 'JV-2026-002',
      postingDate: '2026-01-20',
      accountCode: '40100',
      amountFils: 3000000n, // AED 30,000.00
      memo: 'Support Services'
    }
  ];

  test('Answers natural language financial questions using deterministic math and SQL audit trails', () => {
    const response = AccountingAssistantService.answerFinancialQuery(
      'TOTAL_REVENUE',
      '2026-01',
      citations
    );

    // Sum must be exactly 80,000.00 AED (8,000,000 fils)
    assert.equal(response.computedResultFils, 8000000n);
    assert.equal(response.formattedAed, '80000.00');
    assert.match(response.answerTextEn, /AED 80000.00/);
    assert.match(response.answerTextAr, /80000.00 درهم إماراتي/);

    // SQL query executed must be included for auditability
    assert.match(response.exactQueryExecuted, /SELECT SUM\(amount_base\)/);
    assert.equal(response.sourceCitations.length, 2);
  });
});
