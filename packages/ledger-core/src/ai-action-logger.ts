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
   * Calculates cost in fils (AED minor units, assuming 3.6725 USD/AED peg)
   * e.g. input $3.0/Mtok = 3.0 * 3.6725 * 100 fils / 1_000_000 tok
   */
  static calculateCostFils(model: string, inputTokens: number, outputTokens: number): bigint {
    const pricing = MODEL_PRICING_PER_MTOK[model] || { input: 3.0, output: 15.0 };
    // Cost in USD cents: (in * p_in + out * p_out) / 10,000
    // Pegged at 3.6725 AED/USD: cost in AED fils = cost_usd * 367.25 fils
    const costUsd =
      (inputTokens / 1_000_000) * pricing.input +
      (outputTokens / 1_000_000) * pricing.output;
    const costFils = Math.round(costUsd * 367.25);
    return BigInt(Math.max(1, costFils));
  }

  /**
   * Persists an AI telemetry event directly to the PostgreSQL ai_action_logs table
   */
  static async logActionToDatabase(
    client: { query: (sql: string, params: any[]) => Promise<any> },
    params: {
      tenantId: UUID;
      entityId?: UUID | null;
      userId?: UUID | null;
      actionType: AiActionType | string;
      model: string;
      promptVersion: string;
      inputTokens: number;
      outputTokens: number;
      inputSummary: string;
      outputSummary: string;
      latencyMs: number;
    }
  ): Promise<{ id: string; costFils: bigint }> {
    const costFils = this.calculateCostFils(params.model, params.inputTokens, params.outputTokens);

    const res = await client.query(
      `INSERT INTO ai_action_logs (
         tenant_id, entity_id, user_id, action_type, model_id,
         prompt_version, input_summary, output_summary, prompt_tokens,
         completion_tokens, cost_fils, latency_ms
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        params.tenantId,
        params.entityId || null,
        params.userId || null,
        params.actionType,
        params.model,
        params.promptVersion,
        params.inputSummary,
        params.outputSummary,
        params.inputTokens,
        params.outputTokens,
        costFils.toString(),
        params.latencyMs
      ]
    );

    // Also record in in-memory tracker
    this.logAction({
      tenantId: params.tenantId,
      userId: params.userId || 'system-user',
      actionType: (params.actionType as AiActionType) || 'ASSISTANT_QUERY',
      model: params.model,
      promptVersion: params.promptVersion,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      inputSummary: params.inputSummary,
      outputSummary: params.outputSummary,
      latencyMs: params.latencyMs
    });

    return { id: res.rows[0].id, costFils };
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

