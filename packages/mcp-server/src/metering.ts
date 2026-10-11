import { UUID } from '@ledger-ae/shared-types';
import { roundHalfEven, formatMoney } from '@ledger-ae/ledger-core';

export interface TenantUsageRecord {
  tenantId: UUID;
  billingMonth: string; // 'YYYY-MM'
  aiTokensInput: bigint;
  aiTokensOutput: bigint;
  aiCostAedFils: bigint;
  eInvoicesTransmittedCount: number;
  apiCallsCount: number;
  activeEntitiesCount: number;
  monthlyBudgetCapAedFils: bigint;
  isBudgetThresholdExceeded: boolean;
  budgetAlertMessage?: string;
}

export interface BillingInvoiceStatement {
  tenantId: UUID;
  billingMonth: string;
  baseSubscriptionAedFils: bigint;
  aiUsageChargeAedFils: bigint;
  eInvoiceUsageChargeAedFils: bigint;
  additionalEntitiesChargeAedFils: bigint;
  subtotalAedFils: bigint;
  vat5PctAedFils: bigint;
  totalDueAedFils: bigint;
  formattedTotalAed: string;
  itemizedSummary: string[];
}

export class BillingMeteringEngine {
  private records: Map<string, TenantUsageRecord> = new Map();

  private getKey(tenantId: UUID, billingMonth: string): string {
    return `${tenantId}:${billingMonth}`;
  }

  getOrCreateRecord(
    tenantId: UUID,
    billingMonth: string,
    monthlyBudgetCapAedFils = 500000n // Default AED 5,000 budget cap
  ): TenantUsageRecord {
    const key = this.getKey(tenantId, billingMonth);
    let record = this.records.get(key);
    if (!record) {
      record = {
        tenantId,
        billingMonth,
        aiTokensInput: 0n,
        aiTokensOutput: 0n,
        aiCostAedFils: 0n,
        eInvoicesTransmittedCount: 0,
        apiCallsCount: 0,
        activeEntitiesCount: 1,
        monthlyBudgetCapAedFils,
        isBudgetThresholdExceeded: false
      };
      this.records.set(key, record);
    }
    return record;
  }

  recordAiUsage(
    tenantId: UUID,
    billingMonth: string,
    inputTokens: number,
    outputTokens: number,
    costAedFils: bigint
  ): TenantUsageRecord {
    const record = this.getOrCreateRecord(tenantId, billingMonth);
    record.aiTokensInput += BigInt(inputTokens);
    record.aiTokensOutput += BigInt(outputTokens);
    record.aiCostAedFils += costAedFils;

    // Check 80% and 100% budget thresholds
    const threshold80Pct = (record.monthlyBudgetCapAedFils * 80n) / 100n;
    if (record.aiCostAedFils >= record.monthlyBudgetCapAedFils) {
      record.isBudgetThresholdExceeded = true;
      record.budgetAlertMessage = `CRITICAL: Tenant AI monthly spend (AED ${formatMoney(record.aiCostAedFils, 'AED')}) has exceeded 100% of budget cap (AED ${formatMoney(record.monthlyBudgetCapAedFils, 'AED')}).`;
    } else if (record.aiCostAedFils >= threshold80Pct) {
      record.budgetAlertMessage = `WARNING: Tenant AI monthly spend has reached 80% of budget cap.`;
    }

    return record;
  }

  recordEInvoiceTransmitted(tenantId: UUID, billingMonth: string): TenantUsageRecord {
    const record = this.getOrCreateRecord(tenantId, billingMonth);
    record.eInvoicesTransmittedCount += 1;
    return record;
  }

  recordApiCall(tenantId: UUID, billingMonth: string): TenantUsageRecord {
    const record = this.getOrCreateRecord(tenantId, billingMonth);
    record.apiCallsCount += 1;
    return record;
  }

  setEntityCount(tenantId: UUID, billingMonth: string, count: number): TenantUsageRecord {
    const record = this.getOrCreateRecord(tenantId, billingMonth);
    record.activeEntitiesCount = count;
    return record;
  }

  generateMonthlyBillingStatement(
    tenantId: UUID,
    billingMonth: string
  ): BillingInvoiceStatement {
    const record = this.getOrCreateRecord(tenantId, billingMonth);

    // Pricing Model:
    // Base tier: AED 1,500.00 / month (includes up to 3 entities)
    // Additional entities: AED 300.00 per entity above 3
    // E-invoicing: AED 1.50 per invoice (150 fils)
    // AI charges: Pass-through cost + 15% platform margin
    const BASE_SUBSCRIPTION_FILS = 15000000n; // AED 1,500.00
    const INCLUDED_ENTITIES = 3;
    const ADDITIONAL_ENTITY_PRICE_FILS = 3000000n; // AED 300.00
    const EINVOICE_UNIT_PRICE_FILS = 15000n; // AED 1.50 (150 fils)

    let additionalEntitiesCharge = 0n;
    if (record.activeEntitiesCount > INCLUDED_ENTITIES) {
      const extra = BigInt(record.activeEntitiesCount - INCLUDED_ENTITIES);
      additionalEntitiesCharge = extra * ADDITIONAL_ENTITY_PRICE_FILS;
    }

    const eInvoiceUsageCharge =
      BigInt(record.eInvoicesTransmittedCount) * EINVOICE_UNIT_PRICE_FILS;

    // AI charge with 15% margin
    const aiUsageCharge = roundHalfEven(record.aiCostAedFils * 115n, 100n);

    const subtotal =
      BASE_SUBSCRIPTION_FILS +
      additionalEntitiesCharge +
      eInvoiceUsageCharge +
      aiUsageCharge;

    // UAE VAT @ 5%
    const vat5Pct = roundHalfEven(subtotal * 5n, 100n);
    const totalDue = subtotal + vat5Pct;

    const itemizedSummary: string[] = [
      `Base Subscription (Group Edition): AED ${formatMoney(BASE_SUBSCRIPTION_FILS, 'AED')}`,
      `Active Entities (${record.activeEntitiesCount}): Additional Charge AED ${formatMoney(additionalEntitiesCharge, 'AED')}`,
      `E-Invoicing Transmissions (${record.eInvoicesTransmittedCount} docs @ AED 1.50): AED ${formatMoney(eInvoiceUsageCharge, 'AED')}`,
      `AI Intelligence Usage (${record.aiTokensInput + record.aiTokensOutput} tokens): AED ${formatMoney(aiUsageCharge, 'AED')}`,
      `UAE VAT (5%): AED ${formatMoney(vat5Pct, 'AED')}`
    ];

    return {
      tenantId,
      billingMonth,
      baseSubscriptionAedFils: BASE_SUBSCRIPTION_FILS,
      aiUsageChargeAedFils: aiUsageCharge,
      eInvoiceUsageChargeAedFils: eInvoiceUsageCharge,
      additionalEntitiesChargeAedFils: additionalEntitiesCharge,
      subtotalAedFils: subtotal,
      vat5PctAedFils: vat5Pct,
      totalDueAedFils: totalDue,
      formattedTotalAed: formatMoney(totalDue, 'AED'),
      itemizedSummary
    };
  }
}
