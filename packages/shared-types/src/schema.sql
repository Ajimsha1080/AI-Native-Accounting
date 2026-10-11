-- ============================================================================
-- LedgerAE Multi-Tenant Database Schema with Row-Level Security (RLS)
-- Target: PostgreSQL 16+ (UAE Region Hosted, e.g. AWS me-central-1)
-- Compliance: UAE Federal Decree-Law No. 45 of 2021 (PDPL)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. App schema for RLS session variables
CREATE SCHEMA IF NOT EXISTS app;

-- 2. Tenant Table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    default_country VARCHAR(2) NOT NULL DEFAULT 'AE',
    data_residency_region VARCHAR(50) NOT NULL DEFAULT 'me-central-1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Legal Entity Table (Mainland, Free Zone, ADGM/DIFC)
CREATE TABLE IF NOT EXISTS legal_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_name_en VARCHAR(255) NOT NULL,
    legal_name_ar VARCHAR(255) NOT NULL,
    trade_license_number VARCHAR(100) NOT NULL,
    trn VARCHAR(15), -- 15-digit UAE TRN
    corporate_tax_trn VARCHAR(15),
    jurisdiction_type VARCHAR(50) NOT NULL, -- 'MAINLAND', 'FREE_ZONE', 'FINANCIAL_FREE_ZONE'
    free_zone_name VARCHAR(100), -- 'DMCC', 'DIFC', 'ADGM', 'JAFZA', etc.
    is_qualifying_free_zone_person BOOLEAN NOT NULL DEFAULT FALSE,
    base_currency VARCHAR(3) NOT NULL DEFAULT 'AED',
    address_emirate VARCHAR(50) NOT NULL, -- 'DUBAI', 'ABU_DHABI', etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_trn_format CHECK (trn IS NULL OR (length(trn) = 15 AND trn ~ '^[0-9]{15}$'))
);

-- 4. Users and Roles
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name_en VARCHAR(255) NOT NULL,
    full_name_ar VARCHAR(255),
    role VARCHAR(50) NOT NULL, -- 'OWNER', 'CFO', 'FINANCIAL_CONTROLLER', etc.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_2fa_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Immutable Audit Log Table
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

-- 6. Chart of Accounts Table
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

-- 7. Books (Statutory IFRS, UAE Tax, Management)
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

-- 8. Accounting Periods
CREATE TABLE IF NOT EXISTS accounting_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    fiscal_year INT NOT NULL,
    period_number INT NOT NULL, -- 1 to 12
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_soft_locked BOOLEAN NOT NULL DEFAULT FALSE,
    is_hard_locked BOOLEAN NOT NULL DEFAULT FALSE,
    locked_at TIMESTAMPTZ,
    locked_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_fiscal_period UNIQUE(legal_entity_id, fiscal_year, period_number)
);

-- 9. Append-Only Journal Entries
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
    source_module VARCHAR(50) NOT NULL, -- 'MANUAL', 'AR_INVOICE', 'AP_BILL', 'BANK_REC', 'AI_ACCRUAL'
    source_id UUID,
    memo_en TEXT,
    memo_ar TEXT,
    created_by UUID REFERENCES users(id),
    posted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    previous_entry_hash VARCHAR(64), -- Merkle ledger hash chain
    entry_hash VARCHAR(64) NOT NULL,
    CONSTRAINT uq_entity_entry_number UNIQUE(legal_entity_id, entry_number)
);

-- 10. Journal Lines (Integer minor units, no floats)
CREATE TABLE IF NOT EXISTS journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    currency VARCHAR(3) NOT NULL, -- ISO-4217
    amount_txn BIGINT NOT NULL,   -- minor units in transaction currency
    amount_base BIGINT NOT NULL,  -- minor units in base AED
    fx_rate BIGINT NOT NULL DEFAULT 100000000, -- scaled 10^8 (e.g. 1.00000000)
    direction VARCHAR(10) NOT NULL, -- 'DEBIT', 'CREDIT'
    vat_code VARCHAR(50), -- 'SR_5', 'ZR_EXP_0', 'EX_FIN', 'RCM_5', etc.
    vat_rate_bps INT DEFAULT 0, -- 500 for 5.00%
    vat_amount_base BIGINT DEFAULT 0,
    dimension_project_id UUID,
    dimension_cost_center_id UUID,
    dimension_location_id UUID,
    line_order INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_direction CHECK (direction IN ('DEBIT', 'CREDIT')),
    CONSTRAINT chk_positive_amounts CHECK (amount_txn >= 0 AND amount_base >= 0)
);

-- ============================================================================
-- ENFORCE IMMUTABILITY (Zero updates or deletes on posted financial entries)
-- ============================================================================
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

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;

-- Helper function to read session tenant_id
CREATE OR REPLACE FUNCTION app.get_current_tenant_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- Tenant RLS Policies
CREATE POLICY tenant_isolation_tenants ON tenants
    FOR ALL USING (id = app.get_current_tenant_id());

CREATE POLICY tenant_isolation_legal_entities ON legal_entities
    FOR ALL USING (tenant_id = app.get_current_tenant_id());

CREATE POLICY tenant_isolation_users ON users
    FOR ALL USING (tenant_id = app.get_current_tenant_id());

CREATE POLICY tenant_isolation_audit_logs ON audit_logs
    FOR ALL USING (tenant_id = app.get_current_tenant_id());

CREATE POLICY tenant_isolation_chart_of_accounts ON chart_of_accounts
    FOR ALL USING (tenant_id = app.get_current_tenant_id());

CREATE POLICY tenant_isolation_books ON books
    FOR ALL USING (tenant_id = app.get_current_tenant_id());

CREATE POLICY tenant_isolation_accounting_periods ON accounting_periods
    FOR ALL USING (tenant_id = app.get_current_tenant_id());

CREATE POLICY tenant_isolation_journal_entries ON journal_entries
    FOR ALL USING (tenant_id = app.get_current_tenant_id());

CREATE POLICY tenant_isolation_journal_lines ON journal_lines
    FOR ALL USING (tenant_id = app.get_current_tenant_id());
