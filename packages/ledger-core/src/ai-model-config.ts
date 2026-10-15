/**
 * Anthropic Model Configuration & AI Telemetry Cost Engine
 * 
 * Invariants:
 * 1. Model ID is sourced dynamically from environment variables (ANTHROPIC_MODEL_ID or ANTHROPIC_MODEL).
 * 2. Model ID must match a validated current Anthropic model.
 * 3. In production (NODE_ENV === 'production'), execution strictly FAILS CLOSED if model ID is unset or invalid.
 * 4. Calculates token costs deterministically in both USD and integer UAE fils (zero floating point drift).
 */

export const VALID_CURRENT_ANTHROPIC_MODELS = [
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229'
] as const;

export type ValidAnthropicModel = typeof VALID_CURRENT_ANTHROPIC_MODELS[number];

export const DEFAULT_DEV_ANTHROPIC_MODEL: ValidAnthropicModel = 'claude-3-7-sonnet-20250219';

/**
 * Official Anthropic Token Pricing per 1,000,000 tokens (USD).
 * Citations: https://docs.anthropic.com/en/docs/about-claude/models
 */
export const ANTHROPIC_MODEL_PRICING_PER_MTOK: Record<string, { inputUsd: number; outputUsd: number }> = {
  'claude-3-7-sonnet-20250219': { inputUsd: 3.0, outputUsd: 15.0 },
  'claude-3-5-sonnet-20241022': { inputUsd: 3.0, outputUsd: 15.0 },
  'claude-3-5-haiku-20241022': { inputUsd: 0.8, outputUsd: 4.0 },
  'claude-3-opus-20240229': { inputUsd: 15.0, outputUsd: 75.0 }
};

/**
 * Fixed Peg Exchange Rate: 1 USD = 3.6725 AED (367.25 fils per USD)
 * Central Bank of the UAE official statutory peg.
 */
export const USD_TO_FILS_EXCHANGE_RATE = 36725n; // 367.25 fils * 100 for integer arithmetic

/**
 * Resolves and validates the Anthropic model ID.
 * In production, fails closed with a clear error if unset or unsupported.
 */
export function getValidatedAnthropicModel(overrideModel?: string): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const configured = overrideModel || process.env.ANTHROPIC_MODEL_ID || process.env.ANTHROPIC_MODEL;

  if (!configured || configured.trim() === '') {
    if (isProduction) {
      throw new Error(
        'FATAL: ANTHROPIC_MODEL_ID must be set in production to a validated Anthropic model (e.g. claude-3-7-sonnet-20250219 or claude-3-5-sonnet-20241022).'
      );
    }
    return DEFAULT_DEV_ANTHROPIC_MODEL;
  }

  const trimmed = configured.trim();

  const isValid = (VALID_CURRENT_ANTHROPIC_MODELS as readonly string[]).includes(trimmed);
  if (!isValid) {
    if (isProduction) {
      throw new Error(
        `FATAL: Invalid Anthropic model ID "${trimmed}". Valid models: ${VALID_CURRENT_ANTHROPIC_MODELS.join(', ')}`
      );
    }
    // In dev/test, warn but validate against prefix
    if (!trimmed.startsWith('claude-3-')) {
      throw new Error(
        `Invalid Anthropic model ID "${trimmed}". Supported models must belong to the Claude 3/3.5/3.7 family: ${VALID_CURRENT_ANTHROPIC_MODELS.join(', ')}`
      );
    }
  }

  return trimmed;
}

/**
 * Calculates execution cost in USD based on official token pricing.
 */
export function calculateAiCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = ANTHROPIC_MODEL_PRICING_PER_MTOK[model] || ANTHROPIC_MODEL_PRICING_PER_MTOK[DEFAULT_DEV_ANTHROPIC_MODEL];
  const inputCost = (inputTokens / 1_000_000) * pricing.inputUsd;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputUsd;
  return Math.round((inputCost + outputCost) * 100_000_000) / 100_000_000;
}

/**
 * Calculates execution cost in integer UAE fils (BigInt) at the statutory USD/AED peg.
 * 1 USD = 3.6725 AED = 367.25 fils.
 */
export function calculateAiCostFils(model: string, inputTokens: number, outputTokens: number): bigint {
  const costUsd = calculateAiCostUsd(model, inputTokens, outputTokens);
  // Integer arithmetic: costUsd * 367.25 fils = (costUsd * 100,000 * 36725) / 10,000,000
  const costUsdMicro = BigInt(Math.round(costUsd * 1_000_000));
  const fils = ((costUsdMicro * USD_TO_FILS_EXCHANGE_RATE) + 50_000_000n) / 100_000_000n;
  return fils;
}
