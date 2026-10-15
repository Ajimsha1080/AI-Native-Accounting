import { UUID } from '@ledger-ae/shared-types';
import {
  calculateAiCostUsd,
  calculateAiCostFils,
  getValidatedAnthropicModel
} from './ai-model-config.js';

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
  model: string; // e.g. 'claude-3-7-sonnet-20250219' or 'claude-3-5-sonnet-20241022'
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number; // e.g. input $3/Mtok, output $15/Mtok
  costFils: bigint; // Integer fils at statutory peg
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
    const costUsd = calculateAiCostUsd(params.model, params.inputTokens, params.outputTokens);
    const costFils = calculateAiCostFils(params.model, params.inputTokens, params.outputTokens);

    const logEntry: AiActionLog = {
      id: `ai-log-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      tenantId: params.tenantId,
      userId: params.userId,
      actionType: params.actionType,
      model: params.model,
      promptVersion: params.promptVersion,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCostUsd: costUsd,
      costFils,
      inputSummary: params.inputSummary,
      outputSummary: params.outputSummary,
      executionLatencyMs: params.latencyMs,
      createdAt: new Date().toISOString()
    };

    this.logs.push(logEntry);

    // Update tenant budget
    const budget = this.tenantBudgets.get(params.tenantId);
    if (budget) {
      budget.currentSpendUsd += costUsd;
      const spendPercent = (budget.currentSpendUsd / budget.monthlyBudgetUsd) * 100;
      if (spendPercent >= budget.alertThresholdPercent) {
        budget.alertTriggered = true;
      }
      if (budget.currentSpendUsd >= budget.monthlyBudgetUsd) {
        budget.isBudgetExceeded = true;
      }
    }

    // Log model, prompt version and cost per action to telemetry
    console.info(
      `[AI_TELEMETRY] action=${params.actionType} model=${params.model} promptVersion=${params.promptVersion} tokens=${params.inputTokens}+${params.outputTokens} costUsd=$${costUsd} costFils=${costFils}n latency=${params.latencyMs}ms`
    );

    return logEntry;
  }

  /**
   * Calculates cost in fils (AED minor units, assuming 3.6725 USD/AED peg)
   */
  static calculateCostFils(model: string, inputTokens: number, outputTokens: number): bigint {
    return calculateAiCostFils(model, inputTokens, outputTokens);
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

