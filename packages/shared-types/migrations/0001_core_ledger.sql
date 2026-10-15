-- Migration 0001: Core Ledger Schema (Tenants, Entities, Users, COA, Books, Periods, Journals, Lines, Audit Logs)
-- Target: PostgreSQL 16+

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS app;

-- 1. Tenants
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    default_country VARCHAR(2) NOT NULL DEFAULT 'AE',
    data_residency_region VARCHAR(50) NOT NULL DEFAULT 'me-central-1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Legal Entities
CREATE TABLE IF NOT EXISTS legal_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_name_en VARCHAR(255) NOT NULL,
    legal_name_ar VARCHAR(255) NOT NULL,
    trade_license_number VARCHAR(100) NOT NULL,
    trn VARCHAR(15),
    corporate_tax_trn VARCHAR(15),
    jurisdiction_type VARCHAR(50) NOT NULL, -- 'MAINLAND', 'FREE_ZONE', 'FINANCIAL_FREE_ZONE'
    free_zone_name VARCHAR(100),
    is_qualifying_free_zone_person BOOLEAN NOT NULL DEFAULT FALSE,
    base_currency VARCHAR(3) NOT NULL DEFAULT 'AED',
    address_emirate VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_trn_format CHECK (trn IS NULL OR length(trn) = 15)
);

-- 3. Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name_en VARCHAR(255) NOT NULL,
    full_name_ar VARCHAR(255),
    role VARCHAR(50) NOT NULL, -- 'OWNER', 'CFO', 'FINANCIAL_CONTROLLER', 'ACCOUNTANT', 'AUDITOR'
    password_hash VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_2fa_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    totp_secret_encrypted TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id UUID REFERENCES legal_entities(id),
    user_id UUID REFERENCES users(id),
    role VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(100) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    payload_before JSONB,
    payload_after JSONB,
    diff_hash VARCHAR(64) NOT NULL,
    is_ai_initiated BOOLEAN NOT NULL DEFAULT FALSE,
    ai_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Chart of Accounts
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'
    sub_type VARCHAR(50) NOT NULL,
    normal_balance VARCHAR(10) NOT NULL, -- 'DEBIT', 'CREDIT'
    is_reconciliation_account BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_account_code UNIQUE(legal_entity_id, code)
);

-- 6. Books
CREATE TABLE IF NOT EXISTS books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    book_code VARCHAR(50) NOT NULL, -- 'STATUTORY_IFRS', 'UAE_TAX', 'MANAGEMENT'
    currency VARCHAR(3) NOT NULL DEFAULT 'AED',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_book_code UNIQUE(legal_entity_id, book_code)
);

-- 7. Accounting Periods
CREATE TABLE IF NOT EXISTS accounting_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    fiscal_year INT NOT NULL,
    period_number INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_soft_locked BOOLEAN NOT NULL DEFAULT FALSE,
    is_hard_locked BOOLEAN NOT NULL DEFAULT FALSE,
    locked_at TIMESTAMPTZ,
    locked_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_fiscal_period UNIQUE(legal_entity_id, fiscal_year, period_number)
);

-- 8. Journal Entries
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
    period_id UUID NOT NULL REFERENCES accounting_periods(id) ON DELETE RESTRICT,
    entry_number VARCHAR(100) NOT NULL,
    posting_date DATE NOT NULL,
    document_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'POSTED', -- 'DRAFT', 'POSTED', 'REVERSED'
    source_module VARCHAR(50) NOT NULL,
    source_id UUID,
    memo_en TEXT,
    memo_ar TEXT,
    created_by UUID REFERENCES users(id),
    posted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    previous_entry_hash VARCHAR(64),
    entry_hash VARCHAR(64) NOT NULL,
    CONSTRAINT uq_entity_entry_number UNIQUE(legal_entity_id, entry_number)
);

-- 9. Journal Lines
CREATE TABLE IF NOT EXISTS journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    currency VARCHAR(3) NOT NULL,
    amount_txn BIGINT NOT NULL,
    amount_base BIGINT NOT NULL,
    fx_rate BIGINT NOT NULL DEFAULT 100000000,
    direction VARCHAR(10) NOT NULL, -- 'DEBIT', 'CREDIT'
    vat_code VARCHAR(50),
    vat_rate_bps INT DEFAULT 0,
    vat_amount_base BIGINT DEFAULT 0,
    dimension_project_id UUID,
    dimension_cost_center_id UUID,
    dimension_location_id UUID,
    line_order INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_direction CHECK (direction IN ('DEBIT', 'CREDIT')),
    CONSTRAINT chk_positive_amounts CHECK (amount_txn >= 0 AND amount_base >= 0)
);

-- Append-only trigger
CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        RAISE EXCEPTION 'CRITICAL: Posted journal entries and lines are strictly immutable and cannot be deleted.';
    ELSIF (TG_OP = 'UPDATE') THEN
        RAISE EXCEPTION 'CRITICAL: Posted journal entries and lines are strictly immutable and cannot be modified. Issue a reversing entry instead.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_journal_entries ON journal_entries;
CREATE TRIGGER trg_immutable_journal_entries
BEFORE UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

DROP TRIGGER IF EXISTS trg_immutable_journal_lines ON journal_lines;
CREATE TRIGGER trg_immutable_journal_lines
BEFORE UPDATE OR DELETE ON journal_lines
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

-- RLS Helper Function
CREATE OR REPLACE FUNCTION app.get_current_tenant_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- RLS Activation & Policies
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_tenants_select ON tenants FOR SELECT USING (id = app.get_current_tenant_id() OR app.get_current_tenant_id() IS NULL);
CREATE POLICY tenant_isolation_tenants_write ON tenants FOR ALL USING (id = app.get_current_tenant_id()) WITH CHECK (id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_legal_entities ON legal_entities FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_users ON users FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_audit_logs ON audit_logs FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_chart_of_accounts ON chart_of_accounts FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_books ON books FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_accounting_periods ON accounting_periods FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_journal_entries ON journal_entries FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_journal_lines ON journal_lines FOR ALL USING (tenant_id = app.get_current_tenant_id());
