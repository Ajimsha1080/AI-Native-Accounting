-- Migration 0004: Workflow Runs, Webhook Subscriptions and Delivery Audit
-- Implements Phase 6 Temporal durable workflows, transactional outbox & signed webhook delivery

-- 1. Workflow Execution Tracking
CREATE TABLE IF NOT EXISTS workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    workflow_type VARCHAR(100) NOT NULL, -- 'MONTH_END_CLOSE', 'ACCOUNTING_AGENT', 'EINVOICE_RETRY', 'BANK_FEED_SYNC'
    temporal_workflow_id VARCHAR(255) NOT NULL UNIQUE,
    temporal_run_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'RUNNING', -- 'RUNNING', 'COMPLETED', 'FAILED', 'TIMED_OUT'
    input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    state_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    checkpoints JSONB NOT NULL DEFAULT '[]'::jsonb,
    attempt_count INT NOT NULL DEFAULT 1,
    error_log JSONB NOT NULL DEFAULT '[]'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_workflow_runs ON workflow_runs 
    FOR ALL USING (tenant_id = app.get_current_tenant_id());

-- 2. Webhook Subscriptions
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    url TEXT NOT NULL,
    secret VARCHAR(255) NOT NULL,
    subscribed_events TEXT[] NOT NULL DEFAULT '{"*"}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_webhook_subscriptions ON webhook_subscriptions 
    FOR ALL USING (tenant_id = app.get_current_tenant_id());

-- 3. Webhook Delivery Attempts (Audit & Dead Letter Queue)
CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    subscription_id UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
    outbox_event_id UUID NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
    attempt_number INT NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'DELIVERED', 'FAILED', 'EXHAUSTED_DLQ'
    response_status_code INT,
    error_message TEXT,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE webhook_delivery_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_webhook_delivery_attempts ON webhook_delivery_attempts 
    FOR ALL USING (tenant_id = app.get_current_tenant_id());
