-- Migration 0008: AI Telemetry and Eval Logs Schema Enhancement
-- Phase E: Ensures ai_action_logs has full telemetry fields (user_id, prompt_version, input_summary, output_summary)
-- and ai_proposals supports category, reasoning_summary, prompt_tokens, completion_tokens, cost_fils, model_name

-- Enhance ai_action_logs columns
ALTER TABLE ai_action_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE ai_action_logs ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(100) NOT NULL DEFAULT 'v1.0.0';
ALTER TABLE ai_action_logs ADD COLUMN IF NOT EXISTS input_summary TEXT;
ALTER TABLE ai_action_logs ADD COLUMN IF NOT EXISTS output_summary TEXT;
ALTER TABLE ai_action_logs ADD COLUMN IF NOT EXISTS latency_ms INT NOT NULL DEFAULT 0;

-- Enhance ai_proposals columns
ALTER TABLE ai_proposals ADD COLUMN IF NOT EXISTS category VARCHAR(100) NOT NULL DEFAULT 'GENERAL';
ALTER TABLE ai_proposals ADD COLUMN IF NOT EXISTS reasoning_summary TEXT;
ALTER TABLE ai_proposals ADD COLUMN IF NOT EXISTS prompt_tokens INT NOT NULL DEFAULT 0;
ALTER TABLE ai_proposals ADD COLUMN IF NOT EXISTS completion_tokens INT NOT NULL DEFAULT 0;
ALTER TABLE ai_proposals ADD COLUMN IF NOT EXISTS cost_fils BIGINT NOT NULL DEFAULT 0;
ALTER TABLE ai_proposals ADD COLUMN IF NOT EXISTS model_name VARCHAR(100) NOT NULL DEFAULT 'claude-3-5-sonnet-20241022';
ALTER TABLE ai_proposals ADD COLUMN IF NOT EXISTS source_document_id VARCHAR(255);
ALTER TABLE ai_proposals ADD COLUMN IF NOT EXISTS target_resource_id VARCHAR(255);
ALTER TABLE ai_proposals ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE ai_proposals ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);
