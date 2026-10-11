import { UserRole, Permission } from './index.js';

/**
 * Standard Role-to-Permission Matrix for LedgerAE.
 * Implements Segregation of Duties (SoD) for UAE corporate governance and external audit.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.OWNER]: Object.values(Permission),
  [UserRole.CFO]: [
    Permission.LEDGER_POST,
    Permission.LEDGER_READ,
    Permission.LEDGER_LOCK,
    Permission.LEDGER_REOPEN,
    Permission.INVOICE_CREATE,
    Permission.INVOICE_APPROVE,
    Permission.BILL_CREATE,
    Permission.BILL_APPROVE_TIER1,
    Permission.BILL_APPROVE_TIER2,
    Permission.BILL_APPROVE_TIER3,
    Permission.BANK_RECONCILE,
    Permission.PAYMENT_RUN_EXECUTE,
    Permission.TAX_SUBMIT,
    Permission.EINVOICE_TRANSMIT,
    Permission.AUDIT_READ,
    Permission.TENANT_MANAGE
  ],
  [UserRole.FINANCIAL_CONTROLLER]: [
    Permission.LEDGER_POST,
    Permission.LEDGER_READ,
    Permission.LEDGER_LOCK,
    Permission.INVOICE_CREATE,
    Permission.INVOICE_APPROVE,
    Permission.BILL_CREATE,
    Permission.BILL_APPROVE_TIER1,
    Permission.BILL_APPROVE_TIER2,
    Permission.BANK_RECONCILE,
    Permission.TAX_SUBMIT,
    Permission.EINVOICE_TRANSMIT,
    Permission.AUDIT_READ
  ],
  [UserRole.SENIOR_ACCOUNTANT]: [
    Permission.LEDGER_POST,
    Permission.LEDGER_READ,
    Permission.INVOICE_CREATE,
    Permission.BILL_CREATE,
    Permission.BILL_APPROVE_TIER1,
    Permission.BANK_RECONCILE,
    Permission.AUDIT_READ
  ],
  [UserRole.JUNIOR_ACCOUNTANT]: [
    Permission.LEDGER_READ,
    Permission.INVOICE_CREATE,
    Permission.BILL_CREATE
  ],
  [UserRole.EXTERNAL_AUDITOR]: [
    Permission.LEDGER_READ,
    Permission.AUDIT_READ
  ],
  [UserRole.TAX_AGENT]: [
    Permission.LEDGER_READ,
    Permission.TAX_SUBMIT,
    Permission.AUDIT_READ
  ],
  [UserRole.VIEWER]: [
    Permission.LEDGER_READ
  ]
};

export class RbacService {
  /**
   * Evaluates whether a given role holds the required permission.
   */
  hasPermission(role: UserRole, requiredPermission: Permission): boolean {
    const permissions = ROLE_PERMISSIONS[role] || [];
    return permissions.includes(requiredPermission);
  }

  /**
   * Enforces Segregation of Duties (SoD):
   * A user who created a draft cannot approve it.
   */
  canApproveVoucher(creatorUserId: string, approverUserId: string, role: UserRole): boolean {
    if (creatorUserId === approverUserId) {
      return false; // SoD violation: Self-approval forbidden
    }
    return this.hasPermission(role, Permission.LEDGER_POST);
  }
}
