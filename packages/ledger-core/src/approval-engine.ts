import { UserRole, Permission, UUID } from '@ledger-ae/shared-types';
import { RbacService } from '@ledger-ae/shared-types';

export enum ApprovalTier {
  TIER_1_STANDARD = 'TIER_1_STANDARD',     // <= 10,000 AED (Senior Accountant / Finance Lead)
  TIER_2_CONTROLLER = 'TIER_2_CONTROLLER', // <= 50,000 AED (Financial Controller)
  TIER_3_EXECUTIVE = 'TIER_3_EXECUTIVE'    // > 50,000 AED (CFO / Owner)
}

export interface BillApprovalRequest {
  billId: UUID;
  amountFils: bigint; // e.g. 15,000 AED = 1500000n fils
  creatorUserId: UUID;
  approverUserId: UUID;
  approverRole: UserRole;
}

export class ApprovalWorkflowEngine {
  private rbac = new RbacService();

  determineRequiredTier(amountFils: bigint): ApprovalTier {
    const tenThousandAedFils = 1000000n; // 10,000.00 AED
    const fiftyThousandAedFils = 5000000n; // 50,000.00 AED

    if (amountFils <= tenThousandAedFils) {
      return ApprovalTier.TIER_1_STANDARD;
    } else if (amountFils <= fiftyThousandAedFils) {
      return ApprovalTier.TIER_2_CONTROLLER;
    } else {
      return ApprovalTier.TIER_3_EXECUTIVE;
    }
  }

  evaluateBillApproval(req: BillApprovalRequest): { isApproved: boolean; reason: string } {
    // 1. Enforce Segregation of Duties
    if (req.creatorUserId === req.approverUserId) {
      return {
        isApproved: false,
        reason: 'Segregation of duties violation: Creators cannot approve their own bills.'
      };
    }

    const requiredTier = this.determineRequiredTier(req.amountFils);

    // 2. Check Role and Tier Limits
    if (requiredTier === ApprovalTier.TIER_1_STANDARD) {
      const canApprove =
        this.rbac.hasPermission(req.approverRole, Permission.BILL_APPROVE_TIER1) ||
        this.rbac.hasPermission(req.approverRole, Permission.BILL_APPROVE_TIER2) ||
        this.rbac.hasPermission(req.approverRole, Permission.BILL_APPROVE_TIER3);
      return {
        isApproved: canApprove,
        reason: canApprove ? 'Approved for Tier 1' : 'Approver lacks Tier 1 bill approval permission'
      };
    } else if (requiredTier === ApprovalTier.TIER_2_CONTROLLER) {
      const canApprove =
        this.rbac.hasPermission(req.approverRole, Permission.BILL_APPROVE_TIER2) ||
        this.rbac.hasPermission(req.approverRole, Permission.BILL_APPROVE_TIER3);
      return {
        isApproved: canApprove,
        reason: canApprove ? 'Approved for Tier 2' : 'Approver lacks Controller (Tier 2) approval permission'
      };
    } else {
      // Tier 3 Executive
      const canApprove = this.rbac.hasPermission(req.approverRole, Permission.BILL_APPROVE_TIER3);
      return {
        isApproved: canApprove,
        reason: canApprove ? 'Approved for Tier 3 Executive' : 'Approver lacks CFO/Executive (Tier 3) approval permission'
      };
    }
  }
}
