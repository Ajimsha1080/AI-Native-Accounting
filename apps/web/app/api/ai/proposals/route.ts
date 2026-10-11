import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { Permission, formatMinorUnitsToDecimal } from '@ledger-ae/shared-types';
import { ClaudeDocumentIntelligenceService } from '@ledger-ae/ledger-core';

export interface AiProposalItem {
  id: string;
  titleEn: string;
  titleAr: string;
  sourceEvent: string;
  targetEntity: string;
  category: 'TAX_OPTIMIZATION' | 'RECONCILIATION' | 'COMPLIANCE' | 'AP_INVOICE' | 'REVENUE_ACCRUAL';
  confidenceScore: number;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  legalBasis: string;
  logicExplanationEn: string;
  logicExplanationAr: string;
  proposedJournal?: {
    debitAccount: string;
    creditAccount: string;
    amountMinorUnits: string; // fils
  };
  costMetrics: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostAedMinorUnits: string; // minor unit fils
    executionLatencyMs: number;
    model: string;
  };
}

const INITIAL_PROPOSALS: AiProposalItem[] = [
  {
    id: 'prop-001',
    titleEn: 'Auto-Match Emirates NBD Inward Wire to Invoice INV-2026-0042',
    titleAr: 'مطابقة تلقائية لتحويل بنك الإمارات دبي الوطني مع الفاتورة INV-2026-0042',
    sourceEvent: 'SWIFT MT940 Feed Ingestion (ENBD-IN-981204)',
    targetEntity: 'Al-Noor Trading LLC (Dubai Mainland)',
    category: 'RECONCILIATION',
    confidenceScore: 0.98,
    status: 'PENDING_REVIEW',
    legalBasis: 'UAE Central Bank Open Finance Standards & IFRS 9 Financial Instruments (VERIFY WITH UAE TAX ADVISOR)',
    logicExplanationEn: 'Identified exact amount equality (AED 142,500.00), exact issue date alignment, and verified counterparty name "Al-Futtaim Group" via Field 86 narrative parsing.',
    logicExplanationAr: 'تم التحقق من تطابق القيمة تماماً (142,500.00 د.إ)، وتوافق تاريخ السند، وتطابق اسم العميل "مجموعة الفطيم" المستخرج من الحقل 86.',
    proposedJournal: {
      debitAccount: '1020 - Emirates NBD Operating (AED)',
      creditAccount: '1200 - Trade Accounts Receivable (AR)',
      amountMinorUnits: '14250000'
    },
    costMetrics: {
      promptTokens: 1120,
      completionTokens: 300,
      totalTokens: 1420,
      estimatedCostAedMinorUnits: '4', // AED 0.04
      executionLatencyMs: 380,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'
    }
  },
  {
    id: 'prop-002',
    titleEn: 'Apply Corporate Tax Small Business Relief (SBR) Exemption under Article 21',
    titleAr: 'تطبيق إعفاء تسهيلات الأعمال الصغيرة لضريبة الشركات بموجب المادة 21',
    sourceEvent: 'Quarterly Corporate Tax Provisioning Run (P01)',
    targetEntity: 'Al-Noor Tech DMCC (Free Zone)',
    category: 'TAX_OPTIMIZATION',
    confidenceScore: 0.95,
    status: 'PENDING_REVIEW',
    legalBasis: 'UAE Federal Decree-Law No. 47 of 2022 Art. 21 & Ministerial Decision No. 73 of 2023 (VERIFY WITH UAE TAX ADVISOR)',
    logicExplanationEn: 'Annualized revenue is AED 2,150,000.00, remaining strictly below the AED 3,000,000.00 statutory threshold. Proposes 0% Corporate Tax election for current fiscal period.',
    logicExplanationAr: 'الإيرادات السنوية بلغت 2,150,000.00 د.إ، وهي أقل من السقف القانوني البالغ 3,000,000.00 د.إ. يُقترح اختيار نسبة 0% لضريبة الشركات لهذه الفترة.',
    costMetrics: {
      promptTokens: 750,
      completionTokens: 140,
      totalTokens: 890,
      estimatedCostAedMinorUnits: '2', // AED 0.02
      executionLatencyMs: 240,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'
    }
  },
  {
    id: 'prop-003',
    titleEn: 'Flag Blocked Input VAT: Client Entertainment Hospitality Invoice',
    titleAr: 'حظر استرداد ضريبة المدخلات: فاتورة ضيافة وترفيه عملاء',
    sourceEvent: 'AP Invoice Ingestion (BILL-2026-9011 - Burj Al Arab Hotel)',
    targetEntity: 'Al-Noor Trading LLC (Dubai Mainland)',
    category: 'COMPLIANCE',
    confidenceScore: 0.99,
    status: 'PENDING_REVIEW',
    legalBasis: 'UAE Federal Decree-Law No. 8 of 2017 on VAT, Article 53(1)(a) Executive Regulations (VERIFY WITH UAE TAX ADVISOR)',
    logicExplanationEn: 'Hospitality and entertainment services provided to non-employees are strictly non-recoverable under Article 53. Proposes reclassifying input tax from Box 9 to non-recoverable expense account 5320.',
    logicExplanationAr: 'خدمات الترفيه والضيافة المقدمة لغير الموظفين محظورة قانونياً من الاسترداد بموجب المادة 53. يُقترح إعادة توجيه الضريبة إلى حساب المصروفات غير المستردة 5320.',
    proposedJournal: {
      debitAccount: '5320 - Non-Recoverable Entertainment Expenses',
      creditAccount: '1300 - Input VAT Recoverable (Box 9)',
      amountMinorUnits: '375000' // AED 3,750.00
    },
    costMetrics: {
      promptTokens: 890,
      completionTokens: 230,
      totalTokens: 1120,
      estimatedCostAedMinorUnits: '3', // AED 0.03
      executionLatencyMs: 310,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'
    }
  }
];

let PROPOSALS: AiProposalItem[] = JSON.parse(JSON.stringify(INITIAL_PROPOSALS));

export function resetProposalsState() {
  PROPOSALS = JSON.parse(JSON.stringify(INITIAL_PROPOSALS));
}

export const GET = withAuth(Permission.LEDGER_READ)(async (req: NextRequest, _ctx) => {
  const { searchParams } = new URL(req.url);
  const reset = searchParams.get('reset');
  if (reset === 'true' || reset === '1') {
    resetProposalsState();
  }
  const pendingCount = PROPOSALS.filter((p) => p.status === 'PENDING_REVIEW').length;
  const totalTokensConsumed = PROPOSALS.reduce((acc, p) => acc + p.costMetrics.totalTokens, 0);

  return NextResponse.json({
    proposals: PROPOSALS,
    pendingCount,
    totalTokensConsumed,
    totalProposals: PROPOSALS.length
  });
});

export const POST = withAuth(Permission.LEDGER_POST)(async (request: NextRequest, _ctx) => {
  try {
    const body = await request.json();

    // AI Invoice Extraction Action
    if (body.action === 'EXTRACT_INVOICE') {
      const { documentId, rawText } = body;
      if (!rawText) {
        return NextResponse.json({ error: 'Missing document raw text' }, { status: 400 });
      }

      const aiService = new ClaudeDocumentIntelligenceService();
      const extracted = await aiService.extractInvoiceFromText(documentId || `doc-${Date.now()}`, rawText);

      // Create a new proposal based on extracted invoice
      const newProposal: AiProposalItem = {
        id: `prop-ai-${Date.now()}`,
        titleEn: `Process Extracted Invoice: ${extracted.invoiceNumber || 'Unknown'} from ${extracted.vendorName || 'Unknown Vendor'}`,
        titleAr: `معالجة الفاتورة المستخرجة: ${extracted.invoiceNumber || 'غير محدد'} من ${extracted.vendorName || 'مورد غير محدد'}`,
        sourceEvent: `OCR Ingestion (${extracted.documentId})`,
        targetEntity: 'Al-Noor Trading LLC',
        category: 'AP_INVOICE',
        confidenceScore: extracted.confidenceScore,
        status: extracted.requiresHumanReview ? 'PENDING_REVIEW' : 'PENDING_REVIEW',
        legalBasis: 'UAE Federal Decree-Law No. 8 of 2017 on Value Added Tax (VERIFY WITH UAE TAX ADVISOR)',
        logicExplanationEn: `Extracted total AED ${formatMinorUnitsToDecimal(extracted.totalFils)} (VAT: AED ${formatMinorUnitsToDecimal(extracted.vatTotalFils)}). TRN valid: ${extracted.isTrnValid}. Math valid: ${extracted.isMathValid}.${extracted.reviewReason ? ` Review note: ${extracted.reviewReason}` : ''}`,
        logicExplanationAr: `تم استخراج الإجمالي ${formatMinorUnitsToDecimal(extracted.totalFils)} د.إ (الضريبة: ${formatMinorUnitsToDecimal(extracted.vatTotalFils)} د.إ). الرقم الضريبي صالح: ${extracted.isTrnValid}. الحسابات متطابقة: ${extracted.isMathValid}.`,
        proposedJournal: {
          debitAccount: '5010 - Operating Expenses',
          creditAccount: '2010 - Trade Accounts Payable (AP)',
          amountMinorUnits: extracted.totalFils.toString()
        },
        costMetrics: {
          promptTokens: 450,
          completionTokens: 180,
          totalTokens: 630,
          estimatedCostAedMinorUnits: '2',
          executionLatencyMs: 320,
          model: extracted.modelUsed
        }
      };

      PROPOSALS.unshift(newProposal);
      return NextResponse.json({ success: true, proposal: newProposal, extracted });
    }

    // Standard Proposal Decision Action
    const { proposalId, decision, rationale } = body;
    const prop = PROPOSALS.find((p) => p.id === proposalId);
    if (!prop) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    if (decision === 'APPROVE') {
      prop.status = 'APPROVED';
    } else if (decision === 'REJECT') {
      prop.status = 'REJECTED';
    } else {
      return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
    }

    return NextResponse.json({ success: true, proposal: prop, rationale });
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error: ' + err.message }, { status: 500 });
  }
});
