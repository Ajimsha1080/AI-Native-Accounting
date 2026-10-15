import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getValidatedAnthropicModel,
  calculateAiCostUsd,
  calculateAiCostFils,
  VALID_CURRENT_ANTHROPIC_MODELS,
  DEFAULT_DEV_ANTHROPIC_MODEL
} from './ai-model-config.js';
import { AiActionLogger } from './ai-action-logger.js';

describe('Phase 3 AI Configuration & Telemetry Cost Invariants', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_MODEL_ID;
    delete process.env.ANTHROPIC_MODEL;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Model ID Resolution & Production Fail-Closed Validation', () => {
    test('Resolves ANTHROPIC_MODEL_ID when configured', () => {
      process.env.ANTHROPIC_MODEL_ID = 'claude-3-7-sonnet-20250219';
      const model = getValidatedAnthropicModel();
      assert.equal(model, 'claude-3-7-sonnet-20250219');
    });

    test('Falls back to ANTHROPIC_MODEL if ANTHROPIC_MODEL_ID is unset', () => {
      process.env.ANTHROPIC_MODEL = 'claude-3-5-sonnet-20241022';
      const model = getValidatedAnthropicModel();
      assert.equal(model, 'claude-3-5-sonnet-20241022');
    });

    test('Allows explicit model override', () => {
      const model = getValidatedAnthropicModel('claude-3-5-haiku-20241022');
      assert.equal(model, 'claude-3-5-haiku-20241022');
    });

    test('Defaults to validated current model in non-production when unset', () => {
      process.env.NODE_ENV = 'development';
      const model = getValidatedAnthropicModel();
      assert.equal(model, DEFAULT_DEV_ANTHROPIC_MODEL);
    });

    test('FAILS CLOSED in production if model ID is unset or empty', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ANTHROPIC_MODEL_ID;
      delete process.env.ANTHROPIC_MODEL;

      assert.throws(
        () => getValidatedAnthropicModel(),
        /FATAL: ANTHROPIC_MODEL_ID must be set in production to a validated Anthropic model/
      );

      // Also fails if empty string
      process.env.ANTHROPIC_MODEL_ID = '   ';
      assert.throws(
        () => getValidatedAnthropicModel(),
        /FATAL: ANTHROPIC_MODEL_ID must be set in production to a validated Anthropic model/
      );
    });

    test('FAILS CLOSED in production if configured with an invalid/unsupported model', () => {
      process.env.NODE_ENV = 'production';
      process.env.ANTHROPIC_MODEL_ID = 'gpt-4o-financial';

      assert.throws(
        () => getValidatedAnthropicModel(),
        /FATAL: Invalid Anthropic model ID "gpt-4o-financial"/
      );
    });

    test('Accepts all validated production models', () => {
      process.env.NODE_ENV = 'production';
      for (const validModel of VALID_CURRENT_ANTHROPIC_MODELS) {
        process.env.ANTHROPIC_MODEL_ID = validModel;
        assert.equal(getValidatedAnthropicModel(), validModel);
      }
    });
  });

  describe('Deterministic Cost Calculation & Integer Fils Conversion', () => {
    test('Calculates token costs in USD with exact floating precision', () => {
      // Claude 3.7 Sonnet: $3.00/MTok in, $15.00/MTok out
      // 1,000 input tokens = $0.003
      // 500 output tokens = $0.0075
      // Total = $0.0105
      const costUsd = calculateAiCostUsd('claude-3-7-sonnet-20250219', 1000, 500);
      assert.equal(costUsd, 0.0105);
    });

    test('Calculates token costs for Claude 3.5 Haiku', () => {
      // Claude 3.5 Haiku: $0.80/MTok in, $4.00/MTok out
      // 10,000 input = $0.008, 1,000 output = $0.004 -> Total $0.012
      const costUsd = calculateAiCostUsd('claude-3-5-haiku-20241022', 10000, 1000);
      assert.equal(costUsd, 0.012);
    });

    test('Converts USD cost to integer UAE fils without floating-point drift', () => {
      // 1 USD = 3.6725 AED = 367.25 fils
      // Total $0.0105 USD * 367.25 = 3.856125 fils -> rounded integer fils = 4n fils
      const costFils = calculateAiCostFils('claude-3-7-sonnet-20250219', 1000, 500);
      assert.equal(typeof costFils, 'bigint');
      assert.equal(costFils, 4n);
    });
  });

  describe('Structured Telemetry Logging (Model, Prompt Version, Cost)', () => {
    test('AiActionLogger logs model, prompt version, and cost per action', () => {
      AiActionLogger.resetForTesting();
      const tenantId = '00000000-0000-0000-0000-000000000001';
      const userId = '00000000-0000-0000-0000-000000000002';

      const log = AiActionLogger.logAction({
        tenantId,
        userId,
        actionType: 'OCR_DOCUMENT_EXTRACTION',
        model: 'claude-3-7-sonnet-20250219',
        promptVersion: 'v2.2.0-bilingual-tax-extract',
        inputTokens: 2500,
        outputTokens: 600,
        inputSummary: 'VAT Invoice OCR input',
        outputSummary: 'Extracted invoice INV-9900',
        latencyMs: 350
      });

      assert.equal(log.model, 'claude-3-7-sonnet-20250219');
      assert.equal(log.promptVersion, 'v2.2.0-bilingual-tax-extract');
      assert.equal(log.estimatedCostUsd, 0.0165);
      assert.equal(log.costFils, 6n); // $0.0165 * 367.25 fils = 6.059625 fils -> 6n fils
      assert.equal(log.executionLatencyMs, 350);

      const tenantLogs = AiActionLogger.getTenantLogs(tenantId);
      assert.equal(tenantLogs.length, 1);
      assert.equal(tenantLogs[0].id, log.id);
    });
  });
});
