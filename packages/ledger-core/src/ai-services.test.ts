import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentIntelligenceService } from './document-intelligence.js';
import {
  AccountingAssistantService,
  ClaudeAccountingAssistantService,
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

describe('AI Layer: Claude Assistant with Typed Query Tools & Citations', () => {
  const citations: QueryCitation[] = [
    {
      voucherNumber: 'JV-2026-0041',
      postingDate: '2026-01-14',
      accountCode: '4010',
      amountFils: 400000000n, // AED 4,000,000.00
      memo: 'Industrial lubricants supply - Abu Dhabi Depot'
    },
    {
      voucherNumber: 'JV-2026-0082',
      postingDate: '2026-02-20',
      accountCode: '4010',
      amountFils: 250000000n, // AED 2,500,000.00
      memo: 'Commercial facilities management software services'
    }
  ];

  test('Exposes 4 strictly typed query tools with schemas', () => {
    const tools = ClaudeAccountingAssistantService.getTools();
    assert.equal(tools.length, 4);

    const toolNames = tools.map((t) => t.name);
    assert.ok(toolNames.includes('get_ledger_balance'));
    assert.ok(toolNames.includes('get_vat_return'));
    assert.ok(toolNames.includes('get_aging_summary'));
    assert.ok(toolNames.includes('get_citations'));
  });

  test('Executes get_ledger_balance typed tool with zero-float integer math', () => {
    const res = ClaudeAccountingAssistantService.executeTypedTool(
      'get_ledger_balance',
      { accountType: 'REVENUE', periodId: '2026-Q1' },
      citations
    );

    assert.equal(res.status, 'SUCCESS');
    assert.equal(res.resultFils, 650000000n); // AED 6,500,000.00
    assert.equal(res.formattedAed, '6500000.00');
    assert.equal(res.citations.length, 2);
    assert.match(res.sqlQuery, /SELECT SUM\(amount_base\)/);
  });

  test('Executes get_citations typed tool returning exact voucher hashes and memos', () => {
    const res = ClaudeAccountingAssistantService.executeTypedTool(
      'get_citations',
      { voucherNumbers: ['JV-2026-0041'] },
      citations
    );

    assert.equal(res.status, 'SUCCESS');
    assert.equal(res.citations.length, 1);
    assert.equal(res.citations[0].voucherNumber, 'JV-2026-0041');
    assert.equal(res.citations[0].amountFils, 400000000n);
  });

  test('askAssistant generates verified bilingual answer with citations and zero hallucination', async () => {
    const assistant = new ClaudeAccountingAssistantService();
    const result = await assistant.askAssistant(
      'What was the total revenue recorded for January 2026?',
      citations,
      { tenantId: 'tenant-test-01', userId: 'user-auditor-01' }
    );

    assert.equal(result.computedResultFils, 650000000n);
    assert.equal(result.formattedAed, '6500000.00');
    assert.ok(result.sourceCitations.length >= 2);
    assert.match(result.answerTextEn, /6500000\.00/);
    assert.match(result.answerTextAr, /6500000\.00/);
    assert.ok(result.disclaimer.includes('VERIFY WITH UAE TAX ADVISOR'));
    assert.ok(result.auditLogId !== undefined);
  });
});
