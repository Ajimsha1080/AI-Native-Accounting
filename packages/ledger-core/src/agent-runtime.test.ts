import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DurableAgentRuntime,
  WorkflowStepDefinition
} from './agent-runtime.js';
import {
  AgentProposal,
  ProposalStatus
} from './agent-guardrails.js';
import {
  ContinuousAiMonitor,
  AnomalyType,
  AnomalySeverity
} from './ai-monitors.js';
import { Direction } from './invariants.js';

describe('Milestone 7: Autonomous Agents Runtime & Continuous Monitors', () => {
  const TENANT_ID = 'tenant-uae-grp-01';

  describe('Durable Agent Runtime: Restart Survival & Retry Resiliency', () => {
    test('Agent workflow survives node crash, replays checkpoints, retries, and completes successfully', async () => {
      DurableAgentRuntime.resetForTesting();

      // Define 3-step Month-End Accruals Workflow
      const step0: WorkflowStepDefinition = {
        name: 'SCAN_RECURRING_CONTRACTS',
        execute: async (ctx) => {
          return {
            updatedState: {
              activeContractsCount: 3,
              vendorNames: ['AWS Cloud Services', 'Ejari Dubai Office Lease', 'Microsoft 365']
            }
          };
        }
      };

      let step1ExecutionCount = 0;
      let shouldSimulateCrash = true;

      const step1: WorkflowStepDefinition = {
        name: 'COMPUTE_ACCRUAL_AMOUNTS',
        execute: async (ctx) => {
          step1ExecutionCount++;
          if (shouldSimulateCrash && step1ExecutionCount === 1) {
            throw new Error('SIMULATED_TRANSIENT_WORKER_OUTAGE: Pod killed by OOM or network timeout');
          }
          return {
            updatedState: {
              computedAccrualTotalFils: 3500000n // AED 35,000
            }
          };
        }
      };

      const step2: WorkflowStepDefinition = {
        name: 'EMIT_ACCRUAL_PROPOSALS',
        execute: async (ctx) => {
          const totalFils = ctx.computedAccrualTotalFils as bigint;
          const proposal: AgentProposal = {
            id: 'prop-accrual-01',
            agentName: 'MonthEndAccrualsAgent',
            agentTaskType: 'MONTH_END_ACCRUAL',
            title: 'Q1 Month-End Software & Cloud Hosting Accrual',
            rationaleEn: 'Estimated unbilled cloud compute usage based on trailing run-rate.',
            rationaleAr: 'استحقاق تقديري لخدمات الحوسبة السحابية بنهاية الفترة.',
            proposedJournalEntry: {
              entryNumber: 'PROP-JV-2026-099',
              tenantId: TENANT_ID,
              entityId: 'entity-dxb-01',
              bookId: 'book-ifrs-01',
              periodId: '2026-03',
              postingDate: '2026-03-31',
              documentDate: '2026-03-31',
              sourceModule: 'AI_AGENT',
              memoEn: 'Month-End Cloud Hosting Accrual Proposal',
              memoAr: 'مقترح استحقاق الحوسبة السحابية لنهاية الشهر',
              createdBy: 'agent-runtime',
              lines: [
                {
                  accountId: '6010-SOFTWARE-EXPENSE',
                  direction: Direction.DEBIT,
                  amountTxn: totalFils,
                  amountBase: totalFils,
                  fxRate: 100000000n,
                  currency: 'AED'
                },
                {
                  accountId: '2050-ACCRUED-EXPENSES',
                  direction: Direction.CREDIT,
                  amountTxn: totalFils,
                  amountBase: totalFils,
                  fxRate: 100000000n,
                  currency: 'AED'
                }
              ]
            },
            confidenceScore: 0.96,
            requiresHumanApproval: true,
            status: ProposalStatus.PENDING_REVIEW,
            createdAt: new Date().toISOString()
          };

          return {
            updatedState: { proposalsGenerated: 1 },
            proposals: [proposal]
          };
        }
      };

      // 1. Start Workflow
      const run = DurableAgentRuntime.startWorkflow(
        TENANT_ID,
        'MonthEndAccrualsAgent',
        3,
        3 // Max 3 retries
      );
      assert.equal(run.status, 'INITIALIZED');
      assert.equal(run.currentStepIndex, 0);

      // 2. Execute Step 0 (Succeeds and checkpoints state)
      let state: Record<string, any> = {};
      const res0 = await DurableAgentRuntime.executeDurableStep(run.runId, 0, step0, state);
      state = res0.state;
      assert.equal(state.activeContractsCount, 3);
      assert.equal(run.checkpoints.length, 1);
      assert.equal(run.checkpoints[0].stepName, 'SCAN_RECURRING_CONTRACTS');

      // 3. Execute Step 1 (Fails with simulated pod crash)
      await assert.rejects(
        async () => {
          await DurableAgentRuntime.executeDurableStep(run.runId, 1, step1, state);
        },
        /SIMULATED_TRANSIENT_WORKER_OUTAGE/
      );

      // Verify retry state recorded
      assert.equal(run.status, 'RETRYING');
      assert.equal(run.attemptCount, 2);
      assert.equal(run.errorLog.length, 1);

      // 4. Recovery phase: Worker restarts, retrieves workflow from Temporal persistence
      const recovered = DurableAgentRuntime.recoverWorkflowAfterCrash(run.runId);
      assert.equal(recovered.run.runId, run.runId);
      assert.equal(recovered.restoredState.activeContractsCount, 3); // Restored from Step 0 checkpoint
      assert.equal(recovered.nextStepIndex, 1); // Points to Step 1

      // 5. Retry Step 1 (Node has recovered, execution succeeds)
      shouldSimulateCrash = false;
      const res1 = await DurableAgentRuntime.executeDurableStep(
        run.runId,
        1,
        step1,
        recovered.restoredState
      );
      state = res1.state;
      assert.equal(state.computedAccrualTotalFils, 3500000n);
      assert.equal(run.checkpoints.length, 2);

      // 6. Execute Step 2 (Emits proposal and completes workflow)
      const res2 = await DurableAgentRuntime.executeDurableStep(run.runId, 2, step2, state);
      assert.equal(res2.proposals.length, 1);
      assert.equal(run.status, 'COMPLETED');
      assert.ok(run.completedAt);
      assert.equal(run.emittedProposals.length, 1);
    });
  });

  describe('Strict Guardrail Invariant: All Agent Outputs Are Proposals', () => {
    test('Guarantees all agent actions emit proposals and never post directly without human/policy sign-off', () => {
      const history = DurableAgentRuntime.getRunHistory(TENANT_ID);
      assert.ok(history.length > 0);

      for (const run of history) {
        for (const proposal of run.emittedProposals) {
          // Hard Invariant Check: Proposal must be in PENDING_REVIEW or explicit AUTO_APPROVED
          assert.notEqual(proposal.status, 'POSTED');
          assert.ok(
            proposal.status === ProposalStatus.PENDING_REVIEW ||
            proposal.status === ProposalStatus.AUTO_APPROVED,
            'Agent output must strictly be a proposal'
          );
          assert.ok(proposal.proposedJournalEntry, 'Proposal must carry prospective journal entry');
          assert.ok(proposal.rationaleEn, 'Proposal must carry English rationale');
          assert.ok(proposal.rationaleAr, 'Proposal must carry Arabic rationale');
          assert.ok(proposal.confidenceScore > 0, 'Proposal must provide confidence score');
        }
      }
    });
  });

  describe('Run History Visibility (Audit & Temporal Observability)', () => {
    test('Run history is completely queryable with step checkpoints, errors, and emitted proposals', () => {
      const runs = DurableAgentRuntime.getRunHistory(TENANT_ID, 'MonthEndAccrualsAgent');
      assert.ok(runs.length >= 1);

      const run = runs[0];
      assert.ok(run.runId);
      assert.ok(run.workflowId);
      assert.ok(run.startedAt);
      assert.ok(run.completedAt);
      assert.equal(run.totalSteps, 3);
      assert.equal(run.checkpoints.length, 3);
      assert.ok(run.errorLog[0].includes('SIMULATED_TRANSIENT_WORKER_OUTAGE'));
      assert.equal(run.emittedProposals.length, 1);
    });
  });

  describe('Continuous Monitors: 6 Real-World Anomaly Scenarios', () => {
    test('Scenario 1: Detects duplicate vendor bill (same vendor & bill number)', () => {
      const bill = {
        id: 'bill-new',
        vendorName: 'Emaar Hospitality LLC',
        billNumber: 'INV-2026-88',
        amountFils: 5000000n,
        billDate: '2026-03-10'
      };
      const existing = [
        {
          id: 'bill-old',
          vendorName: 'Emaar Hospitality LLC',
          billNumber: 'INV-2026-88',
          amountFils: 5000000n,
          billDate: '2026-03-05'
        }
      ];

      const findings = ContinuousAiMonitor.scanBill(bill, existing);
      assert.equal(findings.length, 1);
      assert.equal(findings[0].anomalyType, AnomalyType.DUPLICATE_BILL);
      assert.equal(findings[0].severity, AnomalySeverity.CRITICAL);
      assert.equal(findings[0].assignedRole, 'AP_CLERK');
    });

    test('Scenario 2: Detects missing TRN when standard VAT is claimed', () => {
      const bill = {
        id: 'bill-trn-missing',
        vendorName: 'Al Rostamani Trading',
        billNumber: 'ART-9901',
        amountFils: 2000000n,
        billDate: '2026-03-12',
        vatCode: 'SR_5' // Claiming 5% VAT but no TRN provided
      };

      const findings = ContinuousAiMonitor.scanBill(bill, []);
      assert.equal(findings.length, 1);
      assert.equal(findings[0].anomalyType, AnomalyType.MISSING_TRN_ON_TAX_INVOICE);
      assert.equal(findings[0].severity, AnomalySeverity.HIGH);
      assert.equal(findings[0].assignedRole, 'TAX_AGENT');
    });

    test('Scenario 3: Detects incorrect VAT code on Article 53 non-recoverable entertainment', () => {
      const bill = {
        id: 'bill-ent',
        vendorName: 'Burj Al Arab Hotel',
        billNumber: 'BAA-DINNER-44',
        amountFils: 1500000n,
        billDate: '2026-03-15',
        lineDescription: 'Client Entertainment & VIP Hospitality',
        vatCode: 'INPUT_SR_5' // Should be INPUT_BLOCKED_5
      };

      const findings = ContinuousAiMonitor.scanBill(bill, []);
      assert.equal(findings.length, 1);
      assert.equal(findings[0].anomalyType, AnomalyType.INCORRECT_VAT_CODE);
      assert.equal(findings[0].severity, AnomalySeverity.HIGH);
      assert.ok(findings[0].actionableRecommendation.includes('INPUT_BLOCKED_5'));
    });

    test('Scenario 4: Detects abnormal pegged FX conversion outlier', () => {
      // Normal USD peg: 3.6725 (367250000n). Abnormal: 3.8500 (385000000n)
      const anomaly = ContinuousAiMonitor.checkFxOutlier('USD', 385000000n);
      assert.ok(anomaly);
      assert.equal(anomaly.anomalyType, AnomalyType.ABNORMAL_FX_RATE);
      assert.equal(anomaly.severity, AnomalySeverity.CRITICAL);
      assert.ok(anomaly.descriptionEn.includes('3.6725'));
    });

    test('Scenario 5: Detects missing recurring month-end accrual', () => {
      const priorMonthVendors = ['Etisalat by e&', 'Amazon Web Services', 'DEWA Dubai Utilities'];
      const currentMonthVendors = ['Etisalat by e&']; // AWS and DEWA missing

      const findings = ContinuousAiMonitor.detectMissingAccruals(
        priorMonthVendors,
        currentMonthVendors,
        '2026-03'
      );

      assert.equal(findings.length, 2);
      assert.equal(findings[0].anomalyType, AnomalyType.MISSING_ACCRUAL);
      assert.ok(findings.some((f) => f.descriptionEn.includes('Amazon Web Services')));
      assert.ok(findings.some((f) => f.descriptionEn.includes('DEWA Dubai Utilities')));
    });

    test('Scenario 6: Conducts financial statement flux analysis (variance > 20% and > AED 10k)', () => {
      const comparisons = [
        // Significant flux: Travel expense jumped from AED 20,000 (2,000,000 fils) to AED 60,000 (6,000,000 fils) (+200%, +AED 40k)
        {
          accountCode: '6030',
          accountName: 'Travel & Accommodation Expense',
          priorPeriodFils: 2000000n,
          currentPeriodFils: 6000000n
        },
        // Insignificant flux: Office stationery increased by AED 500 (50,000 fils)
        {
          accountCode: '6040',
          accountName: 'Office Stationery',
          priorPeriodFils: 100000n,
          currentPeriodFils: 150000n
        }
      ];

      const findings = ContinuousAiMonitor.analyzeFluxVariances(comparisons);
      assert.equal(findings.length, 1);
      assert.equal(findings[0].anomalyType, AnomalyType.FLUX_EXPLANATION);
      assert.equal(findings[0].accountCode, '6030');
      assert.ok(findings[0].descriptionEn.includes('Variance of 200%'));
      assert.equal(findings[0].assignedRole, 'CONTROLLER');
    });
  });
});
