import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isValidUaeTrn } from '../../uae-tax-engine/dist/trn-validator.js';
import {
  evaluateThreeWayMatch,
  ThreeWayMatchStatus,
  PurchaseOrderItem,
  GoodsReceiptItem,
  VendorBillItem
} from './three-way-match.js';
import { ApprovalWorkflowEngine, ApprovalTier } from './approval-engine.js';
import { UserRole } from '@ledger-ae/shared-types';

describe('Procure to Pay: UAE TRN Validation', () => {
  test('Valid UAE TRNs starting with 100 and 15 digits pass', () => {
    assert.equal(isValidUaeTrn('100234567800003'), true);
    assert.equal(isValidUaeTrn('100987654321001'), true);
  });

  test('Invalid TRNs fail validation', () => {
    assert.equal(isValidUaeTrn('200234567800003'), false); // Doesn't start with 100
    assert.equal(isValidUaeTrn('1002345678'), false); // Too short
    assert.equal(isValidUaeTrn('10023456780000399'), false); // Too long
    assert.equal(isValidUaeTrn('1002345678ABCD3'), false); // Contains non-digits
  });
});

describe('Procure to Pay: Three-Way Matching Engine', () => {
  const samplePO: PurchaseOrderItem = {
    itemId: 'LAPTOP-M3',
    description: 'Workstation Laptops',
    quantityOrdered: 10n,
    unitPriceFils: 500000n, // 5,000.00 AED each
    totalFils: 5000000n
  };

  test('Perfect match across PO, GRN, and Bill succeeds', () => {
    const sampleGRN: GoodsReceiptItem = {
      itemId: 'LAPTOP-M3',
      quantityReceived: 10n,
      receiptDate: '2026-02-10'
    };
    const sampleBill: VendorBillItem = {
      itemId: 'LAPTOP-M3',
      quantityBilled: 10n,
      unitPriceFils: 500000n,
      totalFils: 5000000n
    };

    const result = evaluateThreeWayMatch(samplePO, sampleGRN, sampleBill);
    assert.equal(result.status, ThreeWayMatchStatus.PERFECT_MATCH);
    assert.equal(result.isApprovedForPayment, true);
    assert.equal(result.varianceFils, 0n);
  });

  test('Missing Goods Receipt Note blocks payment approval', () => {
    const sampleBill: VendorBillItem = {
      itemId: 'LAPTOP-M3',
      quantityBilled: 10n,
      unitPriceFils: 500000n,
      totalFils: 5000000n
    };

    const result = evaluateThreeWayMatch(samplePO, undefined, sampleBill);
    assert.equal(result.status, ThreeWayMatchStatus.MISSING_RECEIPT);
    assert.equal(result.isApprovedForPayment, false);
  });

  test('Overbilling quantity beyond goods received fails', () => {
    const partialGRN: GoodsReceiptItem = {
      itemId: 'LAPTOP-M3',
      quantityReceived: 8n, // Only 8 received
      receiptDate: '2026-02-10'
    };
    const overbilledBill: VendorBillItem = {
      itemId: 'LAPTOP-M3',
      quantityBilled: 10n, // Billed for 10
      unitPriceFils: 500000n,
      totalFils: 5000000n
    };

    const result = evaluateThreeWayMatch(samplePO, partialGRN, overbilledBill);
    assert.equal(result.status, ThreeWayMatchStatus.QUANTITY_MISMATCH);
    assert.equal(result.isApprovedForPayment, false);
  });

  test('Matched within tolerance approves payment with variance note', () => {
    const sampleGRN: GoodsReceiptItem = {
      itemId: 'LAPTOP-M3',
      quantityReceived: 10n,
      receiptDate: '2026-02-10'
    };
    // 5,000 AED unit price ordered vs 5,002 AED unit price billed (2 AED / 200 fils diff * 10 = 2,000 fils <= 5,000 fils tolerance)
    const toleranceBill: VendorBillItem = {
      itemId: 'LAPTOP-M3',
      quantityBilled: 10n,
      unitPriceFils: 500200n,
      totalFils: 5002000n
    };

    const result = evaluateThreeWayMatch(samplePO, sampleGRN, toleranceBill);
    assert.equal(result.status, ThreeWayMatchStatus.MATCHED_WITHIN_TOLERANCE);
    assert.equal(result.isApprovedForPayment, true);
    assert.equal(result.varianceFils, 2000n);
  });

  test('Price variance exceeding allowable tolerance rejects payment', () => {
    const sampleGRN: GoodsReceiptItem = {
      itemId: 'LAPTOP-M3',
      quantityReceived: 10n,
      receiptDate: '2026-02-10'
    };
    // 5,000 AED unit price ordered vs 6,000 AED unit price billed (1,000 AED variance * 10 = 10,000 AED diff > 50 AED / 1% tolerance)
    const overpricedBill: VendorBillItem = {
      itemId: 'LAPTOP-M3',
      quantityBilled: 10n,
      unitPriceFils: 600000n,
      totalFils: 6000000n
    };

    const result = evaluateThreeWayMatch(samplePO, sampleGRN, overpricedBill);
    assert.equal(result.status, ThreeWayMatchStatus.PRICE_MISMATCH);
    assert.equal(result.isApprovedForPayment, false);
    assert.ok(result.reasons[0].includes('Price variance'));
  });
});

describe('Procure to Pay: Tiered Approval Workflows', () => {
  const engine = new ApprovalWorkflowEngine();

  test('Amount tiers evaluate correctly based on AED value', () => {
    assert.equal(engine.determineRequiredTier(500000n), ApprovalTier.TIER_1_STANDARD); // 5k AED
    assert.equal(engine.determineRequiredTier(2500000n), ApprovalTier.TIER_2_CONTROLLER); // 25k AED
    assert.equal(engine.determineRequiredTier(10000000n), ApprovalTier.TIER_3_EXECUTIVE); // 100k AED
  });

  test('Segregation of duties: Creator cannot approve their own bill', () => {
    const result = engine.evaluateBillApproval({
      billId: 'bill-001',
      amountFils: 500000n,
      creatorUserId: 'usr-101',
      approverUserId: 'usr-101',
      approverRole: UserRole.FINANCIAL_CONTROLLER
    });
    assert.equal(result.isApproved, false);
    assert.match(result.reason, /Segregation of duties/);
  });

  test('Junior Accountant lacks Tier 1 bill approval permission', () => {
    const result = engine.evaluateBillApproval({
      billId: 'bill-001a',
      amountFils: 500000n, // 5k AED -> Tier 1
      creatorUserId: 'usr-junior-1',
      approverUserId: 'usr-junior-2',
      approverRole: UserRole.JUNIOR_ACCOUNTANT
    });
    assert.equal(result.isApproved, false);
  });

  test('Senior Accountant can approve Tier 1 bills (<= 10k AED)', () => {
    const result = engine.evaluateBillApproval({
      billId: 'bill-001b',
      amountFils: 500000n, // 5k AED -> Tier 1
      creatorUserId: 'usr-junior',
      approverUserId: 'usr-senior',
      approverRole: UserRole.SENIOR_ACCOUNTANT
    });
    assert.equal(result.isApproved, true);
  });

  test('Senior accountant cannot approve Tier 2 bills (> 10k AED)', () => {
    const result = engine.evaluateBillApproval({
      billId: 'bill-002',
      amountFils: 2000000n, // 20,000 AED -> Requires Tier 2
      creatorUserId: 'usr-junior',
      approverUserId: 'usr-senior',
      approverRole: UserRole.SENIOR_ACCOUNTANT
    });
    assert.equal(result.isApproved, false);
  });

  test('Financial Controller can approve Tier 2 bill', () => {
    const result = engine.evaluateBillApproval({
      billId: 'bill-003',
      amountFils: 2000000n, // 20k AED
      creatorUserId: 'usr-junior',
      approverUserId: 'usr-controller',
      approverRole: UserRole.FINANCIAL_CONTROLLER
    });
    assert.equal(result.isApproved, true);
  });

  test('Financial Controller cannot approve Tier 3 Executive bills (> 50k AED)', () => {
    const result = engine.evaluateBillApproval({
      billId: 'bill-004',
      amountFils: 7500000n, // 75,000 AED -> Requires Tier 3 Executive
      creatorUserId: 'usr-junior',
      approverUserId: 'usr-controller',
      approverRole: UserRole.FINANCIAL_CONTROLLER
    });
    assert.equal(result.isApproved, false);
  });

  test('CFO can approve Tier 3 Executive bills (> 50k AED)', () => {
    const result = engine.evaluateBillApproval({
      billId: 'bill-005',
      amountFils: 7500000n, // 75,000 AED -> Tier 3
      creatorUserId: 'usr-junior',
      approverUserId: 'usr-cfo',
      approverRole: UserRole.CFO
    });
    assert.equal(result.isApproved, true);
  });
});
