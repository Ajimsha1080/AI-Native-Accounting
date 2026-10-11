-- Migration 0007: MCP Burned Nonces and Approval Tickets
-- Phase D: Enforces single-use replay protection and durable approval ticket auditing in the database

CREATE TABLE IF NOT EXISTS mcp_burned_nonces (
    nonce VARCHAR(255) PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    proposal_id VARCHAR(255) NOT NULL,
    consumed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE mcp_burned_nonces ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_mcp_burned_nonces ON mcp_burned_nonces
    FOR ALL USING (tenant_id = app.get_current_tenant_id());
ALTER TABLE mcp_burned_nonces FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mcp_burned_nonces_expiry ON mcp_burned_nonces(expires_at);

CREATE TABLE IF NOT EXISTS mcp_approval_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    proposal_id VARCHAR(255) NOT NULL,
    approver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    approver_role VARCHAR(50) NOT NULL,
    nonce VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    signature TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ISSUED', -- 'ISSUED', 'CONSUMED', 'EXPIRED'
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    consumed_at TIMESTAMPTZ
);

ALTER TABLE mcp_approval_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_mcp_approval_tickets ON mcp_approval_tickets
    FOR ALL USING (tenant_id = app.get_current_tenant_id());
ALTER TABLE mcp_approval_tickets FORCE ROW LEVEL SECURITY;
