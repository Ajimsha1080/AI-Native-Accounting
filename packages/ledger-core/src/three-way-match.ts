import { UUID } from '@ledger-ae/shared-types';

export interface PurchaseOrderItem {
  itemId: string;
  description: string;
  quantityOrdered: bigint;
  unitPriceFils: bigint;
  totalFils: bigint;
}

export interface GoodsReceiptItem {
  itemId: string;
  quantityReceived: bigint;
  receiptDate: string;
}

export interface VendorBillItem {
  itemId: string;
  quantityBilled: bigint;
  unitPriceFils: bigint;
  totalFils: bigint;
}

export interface MatchToleranceConfig {
  maxPriceVariancePercentBps: bigint; // e.g. 100n = 1.00%
  maxAbsoluteVarianceFils: bigint;    // e.g. 5000n = 50.00 AED
}

export enum ThreeWayMatchStatus {
  PERFECT_MATCH = 'PERFECT_MATCH',
  MATCHED_WITHIN_TOLERANCE = 'MATCHED_WITHIN_TOLERANCE',
  QUANTITY_MISMATCH = 'QUANTITY_MISMATCH',
  PRICE_MISMATCH = 'PRICE_MISMATCH',
  MISSING_RECEIPT = 'MISSING_RECEIPT'
}

export interface MatchEvaluationResult {
  status: ThreeWayMatchStatus;
  isApprovedForPayment: boolean;
  varianceFils: bigint;
  reasons: string[];
}

/**
 * Executes Three-Way Match between Purchase Order, Goods Receipt Note, and Vendor Bill.
 * Enforces price and quantity tolerances.
 */
export function evaluateThreeWayMatch(
  poItem: PurchaseOrderItem,
  grnItem: GoodsReceiptItem | undefined,
  billItem: VendorBillItem,
  tolerance: MatchToleranceConfig = { maxPriceVariancePercentBps: 100n, maxAbsoluteVarianceFils: 5000n }
): MatchEvaluationResult {
  const reasons: string[] = [];

  // Check 1: Goods Receipt existence
  if (!grnItem) {
    return {
      status: ThreeWayMatchStatus.MISSING_RECEIPT,
      isApprovedForPayment: false,
      varianceFils: billItem.totalFils,
      reasons: ['No goods receipt note (GRN) found matching item. Cannot approve bill without proof of delivery.']
    };
  }

  // Check 2: Quantity Match (Billed vs Received)
  if (billItem.quantityBilled > grnItem.quantityReceived) {
    reasons.push(
      `Quantity billed (${billItem.quantityBilled}) exceeds quantity received (${grnItem.quantityReceived}).`
    );
    return {
      status: ThreeWayMatchStatus.QUANTITY_MISMATCH,
      isApprovedForPayment: false,
      varianceFils: billItem.totalFils - (grnItem.quantityReceived * billItem.unitPriceFils),
      reasons
    };
  }

  // Check 3: Price Match (Billed unit price vs PO unit price)
  const priceDiff = billItem.unitPriceFils - poItem.unitPriceFils;
  const absPriceDiff = priceDiff < 0n ? -priceDiff : priceDiff;

  if (absPriceDiff === 0n && billItem.quantityBilled === grnItem.quantityReceived) {
    return {
      status: ThreeWayMatchStatus.PERFECT_MATCH,
      isApprovedForPayment: true,
      varianceFils: 0n,
      reasons: ['Three-way match verified with 100% precision.']
    };
  }

  // Check tolerances
  const totalVarianceFils = absPriceDiff * billItem.quantityBilled;
  const allowablePercentVariance = (poItem.totalFils * tolerance.maxPriceVariancePercentBps) / 10000n;

  if (
    totalVarianceFils <= tolerance.maxAbsoluteVarianceFils ||
    totalVarianceFils <= allowablePercentVariance
  ) {
    return {
      status: ThreeWayMatchStatus.MATCHED_WITHIN_TOLERANCE,
      isApprovedForPayment: true,
      varianceFils: totalVarianceFils,
      reasons: [`Variance of ${totalVarianceFils} fils is within allowable tolerance limits.`]
    };
  }

  reasons.push(
    `Price variance of ${totalVarianceFils} fils exceeds allowed tolerance (${tolerance.maxAbsoluteVarianceFils} fils / ${tolerance.maxPriceVariancePercentBps} bps).`
  );

  return {
    status: ThreeWayMatchStatus.PRICE_MISMATCH,
    isApprovedForPayment: false,
    varianceFils: totalVarianceFils,
    reasons
  };
}
