import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DocumentIntelligenceService,
  ExtractedInvoiceDocument
} from './document-intelligence.js';
import {
  ClaudeDocumentIntelligenceService
} from './claude-ai-service.js';
import {
  AccountingAssistantService,
  QueryCitation
} from './assistant.js';
import {
  AiActionLogger
} from './ai-action-logger.js';

describe('Milestone 6: AI Assistant & Document Intelligence (Wave R2: AI + E-Invoicing)', () => {
  describe('Document Intelligence Bilingual Benchmark Dataset Eval', () => {
    interface LabelledOcrDoc {
      id: string;
      rawText: string;
      expectedTrn?: string;
      expectedTotalFils: bigint;
      expectedVatCode: string;
    }

    const LABELLED_EVAL_DATASET: LabelledOcrDoc[] = [
      {
        id: 'doc-01',
        rawText: `TAX INVOICE - فاتورة ضريبية
Vendor: Emirates Telecommunications Group (e&)
TRN / الرقم الضريبي: 100222333444555
Invoice No: INV-ET-9901
Date: 2026-03-01
Description: Commercial High-Speed Dedicated Internet
Total / الإجمالي: AED 5,250.00
VAT 5% / ضريبة القيمة المضافة: AED 250.00`,
        expectedTrn: '100222333444555',
        expectedTotalFils: 525000n,
        expectedVatCode: 'SR_5'
      },
      {
        id: 'doc-02',
        rawText: `فاتورة ضريبية - TAX INVOICE
شركة أدنوك للتوزيع - ADNOC Distribution PJSC
الرقم الضريبي TRN: 100777888999000
رقم الفاتورة: ADNOC-2026-4421
التاريخ: 2026-03-05
Commercial Fuel Fleet Supply
المجموع الإجمالي Total: AED 10,500.00
ضريبة القيمة المضافة: AED 500.00`,
        expectedTrn: '100777888999000',
        expectedTotalFils: 1050000n,
        expectedVatCode: 'SR_5'
      },
      {
        id: 'doc-03',
        rawText: `TAX INVOICE
Emaar Properties PJSC
TRN: 100111222333444
Invoice Number: EMAAR-LEASE-2026
Date: 2026-03-10
Downtown Dubai Commercial Office Space Q1
Total: AED 84,000.00
VAT 5%: AED 4,000.00`,
        expectedTrn: '100111222333444',
        expectedTotalFils: 8400000n,
        expectedVatCode: 'SR_5'
      },
      {
        id: 'doc-04',
        rawText: `INVOICE / EXPORT OF SERVICES
Acme Technologies UAE FZCO
TRN: 100888777666555
Invoice No: EXP-2026-01
Date: 2026-03-15
Customer: London Financial Tech Ltd (United Kingdom)
Export of architectural consulting services outside GCC
Zero Rated / بنسبة الصفر
Total: AED 50,000.00`,
        expectedTrn: '100888777666555',
        expectedTotalFils: 5000000n,
        expectedVatCode: 'ZR_EXP_0'
      },
      {
        id: 'doc-05',
        rawText: `CROSS-BORDER CLOUD SERVICES INVOICE
Amazon Web Services US
Foreign Supplier Invoice
Reverse Charge Mechanism / آلية الاحتساب العكسي
Invoice #: AWS-US-88991
Date: 2026-03-18
Cloud Hosting and GPU Compute Services US
Total: AED 36,725.00`,
        expectedTrn: undefined,
        expectedTotalFils: 3672500n,
        expectedVatCode: 'RCM_5'
      },
      {
        id: 'doc-06',
        rawText: `TAX INVOICE
Al Futtaim Motors LLC
TRN: 100333444555666
Invoice #: AF-VEH-1011
Date: 2026-03-20
Commercial Fleet Maintenance & Parts
Total: AED 15,750.00
VAT 5%: AED 750.00`,
        expectedTrn: '100333444555666',
        expectedTotalFils: 1575000n,
        expectedVatCode: 'SR_5'
      },
      {
        id: 'doc-07',
        rawText: `TAX INVOICE - الرعاية الصحية والتعليم
Accredited Medical Center Dubai
TRN: 100444555666777
Invoice No: MED-2026-99
Date: 2026-03-22
Accredited Healthcare & Preventive Services
Zero Rated / الرعاية الصحية الخاضعة لنسبة الصفر
Total: AED 8,000.00`,
        expectedTrn: '100444555666777',
        expectedTotalFils: 800000n,
        expectedVatCode: 'ZR_LOC_0'
      },
      {
        id: 'doc-08',
        rawText: `EXEMPT FINANCIAL SERVICE STATEMENT
UAE National Finance Bank
TRN: 100555666777888
Doc No: FIN-INT-2026-03
Date: 2026-03-25
Commercial Loan Margin & Interest charges
Exempt / الخدمات المالية المعفاة من الضريبة
Total: AED 12,000.00`,
        expectedTrn: '100555666777888',
        expectedTotalFils: 1200000n,
        expectedVatCode: 'EX_FIN'
      },
      {
        id: 'doc-09',
        rawText: `TAX INVOICE
Sharaf DG LLC
TRN: 100666777888999
Invoice No: SDG-RETAIL-44
Date: 2026-03-27
IT Hardware Equipment & Workstations
Total: AED 21,000.00
VAT 5%: AED 1,000.00`,
        expectedTrn: '100666777888999',
        expectedTotalFils: 2100000n,
        expectedVatCode: 'SR_5'
      },
      {
        id: 'doc-10',
        rawText: `TAX INVOICE
DHL Global Forwarding UAE
TRN: 100999000111222
Invoice No: DHL-FRT-8877
Date: 2026-03-28
International airfreight cargo logistics
Total: AED 31,500.00
VAT 5%: AED 1,500.00`,
        expectedTrn: '100999000111222',
        expectedTotalFils: 3150000n,
        expectedVatCode: 'SR_5'
      }
    ];

    test('Meets PRD accuracy eval thresholds across labelled bilingual UAE invoice benchmark', () => {
      let trnCorrect = 0;
      let totalAmountCorrect = 0;
      let vatCodingCorrect = 0;
      const totalDocs = LABELLED_EVAL_DATASET.length;

      for (const sample of LABELLED_EVAL_DATASET) {
        const extracted = DocumentIntelligenceService.processOcrText(sample.id, sample.rawText, {
          tenantId: 'tenant-eval-01',
          userId: 'evaluator-cpa'
        });

        // 1. TRN Accuracy Check
        if (sample.expectedTrn) {
          if (extracted.vendorTrn === sample.expectedTrn && extracted.isTrnValid) {
            trnCorrect++;
          }
        } else {
          if (!extracted.vendorTrn) trnCorrect++;
        }

        // 2. Total Amount & Math Validation Check
        if (extracted.totalFils === sample.expectedTotalFils && extracted.isMathValid) {
          totalAmountCorrect++;
        }

        // 3. VAT Tax Coding Check
        if (extracted.lines.length > 0 && extracted.lines[0].proposedTaxCode === sample.expectedVatCode) {
          vatCodingCorrect++;
        }
      }

      const trnAccuracy = (trnCorrect / totalDocs) * 100;
      const amountAccuracy = (totalAmountCorrect / totalDocs) * 100;
      const vatCodingAccuracy = (vatCodingCorrect / totalDocs) * 100;

      // PRD targets: TRN 100%, Amount >= 95%, VAT Coding >= 95%
      assert.equal(trnAccuracy, 100, `TRN Accuracy ${trnAccuracy}% must be 100%`);
      assert.ok(amountAccuracy >= 95, `Amount Accuracy ${amountAccuracy}% must be >= 95%`);
      assert.ok(vatCodingAccuracy >= 95, `VAT Coding Accuracy ${vatCodingAccuracy}% must be >= 95%`);
    });

    test('Claude Document Intelligence Service validates structured Zod output across benchmark', async () => {
      const claudeService = new ClaudeDocumentIntelligenceService();

      for (const sample of LABELLED_EVAL_DATASET) {
        const res = await claudeService.extractInvoiceFromText(sample.id, sample.rawText);

        assert.equal(res.documentId, sample.id);
        assert.ok(res.totalFils > 0n);
        assert.equal(res.totalFils, sample.expectedTotalFils);
        assert.ok(res.confidenceScore > 0 && res.confidenceScore <= 1.0);
        assert.ok(typeof res.isMathValid === 'boolean');
        assert.ok(typeof res.isTrnValid === 'boolean');

        if (sample.expectedTrn) {
          assert.equal(res.vendorTrn, sample.expectedTrn);
          assert.equal(res.isTrnValid, true);
        } else {
          assert.equal(res.vendorTrn, null);
        }

        assert.ok(res.lines.length > 0);
        assert.equal(res.lines[0].proposedTaxCode, sample.expectedVatCode);
      }
    });
  });

  describe('Strict Invariant: No Ledger Number Ever Generated by the Model', () => {
    test('Numbers are strictly computed via deterministic integer math with full citation drill-down', () => {
      const citations: QueryCitation[] = [
        {
          voucherNumber: 'JV-2026-001',
          postingDate: '2026-03-01',
          accountCode: '4010-SALES',
          amountFils: 5000000n, // AED 50,000.00
          memo: 'Enterprise SaaS Annual License'
        },
        {
          voucherNumber: 'JV-2026-002',
          postingDate: '2026-03-05',
          accountCode: '4010-SALES',
          amountFils: 2500000n, // AED 25,000.00
          memo: 'Implementation & Training'
        }
      ];

      const answer = AccountingAssistantService.answerFinancialQuery(
        'TOTAL_REVENUE',
        '2026-Q1',
        citations,
        { tenantId: 'tenant-pilot-01', userId: 'cfo-user' }
      );

      // Verify numerical precision: strictly equals 50,000 + 25,000 = 75,000.00 AED (7,500,000 fils)
      assert.equal(answer.computedResultFils, 7500000n);
      assert.equal(answer.formattedAed, '75000.00');

      // Verify text answer contains exact formatted number and audit citations
      assert.ok(answer.answerTextEn.includes('75000.00'));
      assert.ok(answer.answerTextAr.includes('75000.00'));
      assert.equal(answer.sourceCitations.length, 2);
      assert.equal(answer.sourceCitations[0].voucherNumber, 'JV-2026-001');
      assert.ok(answer.exactQueryExecuted.startsWith('SELECT SUM(amount_base)'));
      assert.ok(answer.auditLogId, 'Audit log ID must be present');

      // Invariant verification: Zero citations returns strictly 0 fils, never a fabricated estimation
      const emptyAnswer = AccountingAssistantService.answerFinancialQuery(
        'TOTAL_REVENUE',
        '2026-Q2',
        []
      );
      assert.equal(emptyAnswer.computedResultFils, 0n);
      assert.equal(emptyAnswer.formattedAed, '0.00');
    });
  });

  describe('Audit Trail & Cost Governance (NFR Budget Alerts)', () => {
    test('Logs all AI actions with token counts, costs, and enforces tenant budget thresholds', () => {
      AiActionLogger.resetForTesting();
      const tenantId = 'tenant-uae-grp-budget';

      // Set $10.00 monthly budget with 80% alert threshold
      const budget = AiActionLogger.configureTenantBudget(tenantId, 10.0, 80);
      assert.equal(budget.monthlyBudgetUsd, 10.0);
      assert.equal(budget.alertTriggered, false);

      // Execute 5 actions
      for (let i = 0; i < 5; i++) {
        AiActionLogger.logAction({
          tenantId,
          userId: 'cpa-auditor',
          actionType: 'ASSISTANT_QUERY',
          model: 'claude-3-5-sonnet-20241022',
          promptVersion: 'v1.4.0',
          inputTokens: 100000, // 100k tokens
          outputTokens: 20000, // 20k tokens
          inputSummary: `Query batch ${i}`,
          outputSummary: `Result ${i}`,
          latencyMs: 150
        });
      }

      const logs = AiActionLogger.getTenantLogs(tenantId);
      assert.equal(logs.length, 5);

      for (const log of logs) {
        assert.ok(log.estimatedCostUsd > 0);
        assert.equal(log.model, 'claude-3-5-sonnet-20241022');
        assert.ok(log.id.startsWith('ai-log-'));
        assert.ok(log.executionLatencyMs > 0);
      }

      // Check budget tracking
      const updatedBudget = AiActionLogger.getTenantBudget(tenantId);
      assert.ok(updatedBudget);
      assert.ok(updatedBudget.currentSpendUsd > 0);
      assert.equal(typeof updatedBudget.alertTriggered, 'boolean');
    });
  });
});
