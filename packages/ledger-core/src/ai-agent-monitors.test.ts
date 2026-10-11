import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ContinuousAiMonitor,
  AnomalyType,
  AnomalySeverity,
  CandidateBill
} from './ai-monitors.js';
import {
  AgentRuntimeGuardrails,
  AgentProposal,
  ProposalStatus,
  AutoApprovePolicy
} from './agent-guardrails.js';
import { Direction } from './invariants.js';

describe('Continuous AI Monitors: Anomaly & Fraud Detection', () => {
  const existingBills: CandidateBill[] = [
    {
      id: 'bill-posted-01',
      vendorName: 'Etisalat UAE',
      vendorTrn: '100234567800003',
      billNumber: 'ETISALAT-JAN-991',
      amountFils: 150000n, // AED 1,500.00
      billDate: '2026-01-31',
      vatCode: 'SR_5'
    }
  ];

  test('Flags exact vendor and bill number duplicate as CRITICAL anomaly', () => {
    const candidateDuplicate: CandidateBill = {
      id: 'bill-draft-duplicate',
      vendorName: 'Etisalat UAE',
      vendorTrn: '100234567800003',
      billNumber: 'ETISALAT-JAN-991', // Identical bill number
      amountFils: 150000n,
      billDate: '2026-01-31',
      vatCode: 'SR_5'
    };

    const findings = ContinuousAiMonitor.scanBill(candidateDuplicate, existingBills);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].anomalyType, AnomalyType.DUPLICATE_BILL);
    assert.equal(findings[0].severity, AnomalySeverity.CRITICAL);
  });

  test('Flags missing TRN when standard VAT is claimed as HIGH anomaly', () => {
    const billWithoutTrn: CandidateBill = {
      id: 'bill-no-trn',
      vendorName: 'New Office Supplier LLC',
      vendorTrn: undefined, // Missing TRN
      billNumber: 'SUP-8821',
      amountFils: 500000n,
      billDate: '2026-02-01',
      vatCode: 'SR_5'
    };

    const findings = ContinuousAiMonitor.scanBill(billWithoutTrn, existingBills);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].anomalyType, AnomalyType.MISSING_TRN_ON_TAX_INVOICE);
    assert.match(findings[0].descriptionEn, /FTA requires a valid 15-digit TRN/);
  });

  test('Detects abnormal FX pegged currency outliers', () => {
    // Normal USD rate: 3.6725 * 10^8 = 367250000n
    const normalFinding = ContinuousAiMonitor.checkFxOutlier('USD', 367250000n);
    assert.equal(normalFinding, null);

    // Abnormal USD rate (e.g. 4.2500)
    const abnormalFinding = ContinuousAiMonitor.checkFxOutlier('USD', 425000000n);
    assert.ok(abnormalFinding);
    assert.equal(abnormalFinding.anomalyType, AnomalyType.ABNORMAL_FX_RATE);
    assert.equal(abnormalFinding.severity, AnomalySeverity.CRITICAL);
  });
});

describe('AI Agent Guardrails & Human-in-the-Loop Policies', () => {
  const policy: AutoApprovePolicy = {
    maxAmountFils: 100000n, // Max AED 1,000.00
    minConfidence: 0.95,
    allowedTaskTypes: ['MONTH_END_ACCRUAL']
  };

  const createDummyProposal = (amountFils: bigint, confidence: number): AgentProposal => ({
    id: 'prop-uuid-01',
    agentName: 'MonthEndAccrualsAgent',
    agentTaskType: 'MONTH_END_ACCRUAL',
    title: 'Accrue Unbilled Cloud Infrastructure',
    rationaleEn: 'Accrue unbilled usage based on AWS API metrics',
    rationaleAr: 'استحقاق تكاليف الحوسبة السحابية غير المفوتورة',
    confidenceScore: confidence,
    requiresHumanApproval: true,
    status: ProposalStatus.PENDING_REVIEW,
    createdAt: new Date().toISOString(),
    proposedJournalEntry: {
      tenantId: 'ten-01',
      entityId: 'ent-01',
      bookId: 'book-01',
      periodId: 'period-01',
      entryNumber: 'ACCRUAL-AUTO-01',
      postingDate: '2026-01-31',
      documentDate: '2026-01-31',
      sourceModule: 'AI_ACCRUAL',
      memoEn: 'Unbilled AWS Usage Accrual',
      createdBy: 'agent-bot',
      lines: [
        {
          accountId: 'acc-exp',
          currency: 'AED',
          amountTxn: amountFils,
          amountBase: amountFils,
          fxRate: 100000000n,
          direction: Direction.DEBIT
        },
        {
          accountId: 'acc-accrual-liab',
          currency: 'AED',
          amountTxn: amountFils,
          amountBase: amountFils,
          fxRate: 100000000n,
          direction: Direction.CREDIT
        }
      ]
    }
  });

  test('Auto-approves low-risk, high-confidence proposals below threshold', () => {
    // 500.00 AED (50,000 fils) <= 1,000.00 AED limit, 0.98 confidence
    const proposal = createDummyProposal(50000n, 0.98);
    const evaluated = AgentRuntimeGuardrails.evaluateProposalApproval(proposal, policy);

    assert.equal(evaluated.status, ProposalStatus.AUTO_APPROVED);
    assert.equal(evaluated.requiresHumanApproval, false);
  });

  test('Forces human-in-the-loop review for amounts exceeding threshold', () => {
    // 50,000.00 AED (5,000,000 fils) > 1,000.00 AED limit
    const highValueProposal = createDummyProposal(5000000n, 0.99);
    const evaluated = AgentRuntimeGuardrails.evaluateProposalApproval(highValueProposal, policy);

    assert.equal(evaluated.status, ProposalStatus.PENDING_REVIEW);
    assert.equal(evaluated.requiresHumanApproval, true);
  });
});
