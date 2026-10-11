import { UUID } from '@ledger-ae/shared-types';
import { JournalEntryCandidate } from './invariants.js';

export enum ProposalStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  AUTO_APPROVED = 'AUTO_APPROVED'
}

export interface AgentProposal {
  id: UUID;
  agentName: string;
  agentTaskType: 'MONTH_END_ACCRUAL' | 'UNBILLED_USAGE' | 'DEPRECIATION_POSTING';
  title: string;
  rationaleEn: string;
  rationaleAr: string;
  proposedJournalEntry: JournalEntryCandidate;
  confidenceScore: number; // 0 to 1
  requiresHumanApproval: boolean;
  status: ProposalStatus;
  reviewedByUserId?: UUID;
  reviewComment?: string;
  createdAt: string;
}

export interface AutoApprovePolicy {
  maxAmountFils: bigint; // minor units e.g. 1,000.00 AED = 100000n fils
  minConfidence: number; // e.g. 0.95
  allowedTaskTypes: string[];
}

export class AgentRuntimeGuardrails {
  /**
   * Evaluates if an AI agent proposal can be auto-approved or MUST require human sign-off.
   * Hard Rule: High-value or low-confidence proposals NEVER auto-post.
   */
  static evaluateProposalApproval(
    proposal: AgentProposal,
    policy: AutoApprovePolicy
  ): AgentProposal {
    // Total base amount of proposed voucher
    const totalAmountFils = proposal.proposedJournalEntry.lines.reduce(
      (sum, line) => sum + line.amountBase,
      0n
    ) / 2n; // Sum of debits (balanced)

    const isUnderThreshold = totalAmountFils <= policy.maxAmountFils;
    const isHighConfidence = proposal.confidenceScore >= policy.minConfidence;
    const isTaskAllowed = policy.allowedTaskTypes.includes(proposal.agentTaskType);

    if (isUnderThreshold && isHighConfidence && isTaskAllowed) {
      proposal.status = ProposalStatus.AUTO_APPROVED;
      proposal.requiresHumanApproval = false;
    } else {
      proposal.status = ProposalStatus.PENDING_REVIEW;
      proposal.requiresHumanApproval = true;
    }

    return proposal;
  }
}
