-- Migration 0005: Auth Sessions, Recovery Codes and Rate Limiting
-- Phase B: Real Authentication & Session Revocation/Rotation Store

-- 1. One-time recovery codes (stored hashed with SHA-256)
CREATE TABLE IF NOT EXISTS user_recovery_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of recovery code
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_recovery_code_hash UNIQUE(user_id, code_hash)
);

ALTER TABLE user_recovery_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_recovery_codes ON user_recovery_codes
    FOR ALL USING (tenant_id = app.get_current_tenant_id());

-- 2. Sessions table for server-side revocation and rotation
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_id UUID REFERENCES legal_entities(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 of session token
    role VARCHAR(50) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revoked_reason VARCHAR(100),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON sessions(user_id, is_revoked, expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(session_token_hash);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_sessions ON sessions
    FOR ALL USING (tenant_id = app.get_current_tenant_id());

-- 3. Database-backed rate limiting & lockout store
CREATE TABLE IF NOT EXISTS auth_rate_limits (
    identifier VARCHAR(255) PRIMARY KEY,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Note: auth_rate_limits is a system security table shared across unauthenticated login attempts,
-- keyed by identifier (e.g. tenantSlug:email or IP address).
