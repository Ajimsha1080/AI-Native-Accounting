import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { UserRole, Permission, RbacService } from './index.js';

describe('RBAC & Segregation of Duties (SoD)', () => {
  const rbac = new RbacService();

  test('Owner and CFO have full ledger post permissions', () => {
    assert.equal(rbac.hasPermission(UserRole.OWNER, Permission.LEDGER_POST), true);
    assert.equal(rbac.hasPermission(UserRole.CFO, Permission.LEDGER_POST), true);
  });

  test('Auditor and Junior Accountant cannot post to ledger', () => {
    assert.equal(rbac.hasPermission(UserRole.EXTERNAL_AUDITOR, Permission.LEDGER_POST), false);
    assert.equal(rbac.hasPermission(UserRole.JUNIOR_ACCOUNTANT, Permission.LEDGER_POST), false);
  });

  test('Segregation of Duties: Creator cannot approve their own financial voucher', () => {
    const creatorId = 'usr_accountant_001';
    const cfoId = 'usr_cfo_002';

    // Same user attempting to approve -> strictly forbidden
    const selfApprove = rbac.canApproveVoucher(creatorId, creatorId, UserRole.CFO);
    assert.equal(selfApprove, false);

    // Independent CFO approving accountant voucher -> allowed
    const validApproval = rbac.canApproveVoucher(creatorId, cfoId, UserRole.CFO);
    assert.equal(validApproval, true);
  });
});
