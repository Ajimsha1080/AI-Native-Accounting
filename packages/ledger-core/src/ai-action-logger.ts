import { UUID } from '@ledger-ae/shared-types';

export type AiActionType =
  | 'ASSISTANT_QUERY'
  | 'OCR_DOCUMENT_EXTRACTION'
  | 'VAT_CODE_PROPOSAL'
  | 'RECONCILIATION_PROPOSAL'
  | 'ANOMALY_DETECTION';

export interface AiActionLog {
  id: UUID;
  tenantId: UUID;
  userId: UUID;
  actionType: AiActionType;
  model: string; // e.g. 'claude-3-5-sonnet-20241022'
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number; // e.g. input $3/Mtok, output $15/Mtok
  inputSummary: string;
  outputSummary: string;
  executionLatencyMs: number;
  createdAt: string;
}

export interface TenantAiBudget {
  tenantId: UUID;
  monthlyBudgetUsd: number;
  currentSpendUsd: number;
  alertThresholdPercent: number; // e.g. 80
  isBudgetExceeded: boolean;
  alertTriggered: boolean;
}

// Pricing rates per million tokens
const MODEL_PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
  'hosted-ocr-extractor': { input: 1.5, output: 5.0 }
};

export class AiActionLogger {
  private static logs: AiActionLog[] = [];
  private static tenantBudgets: Map<UUID, TenantAiBudget> = new Map();

  /**
   * Initializes or configures a tenant's AI spending budget.
   */
  static configureTenantBudget(
    tenantId: UUID,
    monthlyBudgetUsd: number,
    alertThresholdPercent: number = 80
  ): TenantAiBudget {
    const budget: TenantAiBudget = {
      tenantId,
      monthlyBudgetUsd,
      currentSpendUsd: 0,
      alertThresholdPercent,
      isBudgetExceeded: false,
      alertTriggered: false
    };
    this.tenantBudgets.set(tenantId, budget);
    return budget;
  }

  /**
   * Calculates cost and records an immutable log entry for an AI execution.
   */
  static logAction(params: {
    tenantId: UUID;
    userId: UUID;
    actionType: AiActionType;
    model: string;
    promptVersion: string;
    inputTokens: number;
    outputTokens: number;
    inputSummary: string;
    outputSummary: string;
    latencyMs: number;
  }): AiActionLog {
    const pricing = MODEL_PRICING_PER_MTOK[params.model] || { input: 3.0, output: 15.0 };
    const cost =
      (params.inputTokens / 1_000_000) * pricing.input +
      (params.outputTokens / 1_000_000) * pricing.output;
    const roundedCost = Math.round(cost * 1_000_000) / 1_000_000;

    const logEntry: AiActionLog = {
      id: `ai-log-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      tenantId: params.tenantId,
      userId: params.userId,
      actionType: params.actionType,
      model: params.model,
      promptVersion: params.promptVersion,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCostUsd: roundedCost,
      inputSummary: params.inputSummary,
      outputSummary: params.outputSummary,
      executionLatencyMs: params.latencyMs,
      createdAt: new Date().toISOString()
    };

    this.logs.push(logEntry);

    // Update tenant budget
    const budget = this.tenantBudgets.get(params.tenantId);
    if (budget) {
      budget.currentSpendUsd += roundedCost;
      const spendPercent = (budget.currentSpendUsd / budget.monthlyBudgetUsd) * 100;
      if (spendPercent >= budget.alertThresholdPercent) {
        budget.alertTriggered = true;
      }
      if (budget.currentSpendUsd >= budget.monthlyBudgetUsd) {
        budget.isBudgetExceeded = true;
      }
    }

    return logEntry;
  }

  /**
   * Retrieves all logs for a specific tenant.
   */
  static getTenantLogs(tenantId: UUID): AiActionLog[] {
    return this.logs.filter((l) => l.tenantId === tenantId);
  }

  /**
   * Retrieves budget status for a tenant.
   */
  static getTenantBudget(tenantId: UUID): TenantAiBudget | undefined {
    return this.tenantBudgets.get(tenantId);
  }

  /**
   * Clears in-memory logs (for testing).
   */
  static resetForTesting(): void {
    this.logs = [];
    this.tenantBudgets.clear();
  }
}
