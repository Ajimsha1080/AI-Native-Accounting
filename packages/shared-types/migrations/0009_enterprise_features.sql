-- Migration 0009: Enterprise Features Schema
-- Bill Approvals, Payment Allocations, Multi-Book Ledgers, Fixed Asset Schedules,
-- IFRS 15 Contracts & Milestones, Lease Schedules, Payroll Runs & Employees,
-- Migration Imports, Tenant Subscriptions & Usage Metering.

-- 1. Bill Approvals
CREATE TABLE IF NOT EXISTS bill_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL REFERENCES users(id),
    approval_status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
    tier VARCHAR(20) NOT NULL DEFAULT 'TIER1',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actioned_at TIMESTAMPTZ
);

-- 2. Payment Allocations
CREATE TABLE IF NOT EXISTS payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
    allocated_amount_base BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Multi-Book Ledgers
CREATE TABLE IF NOT EXISTS multi_book_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    book_type VARCHAR(50) NOT NULL, -- 'STATUTORY_TAX', 'IFRS_MANAGEMENT', 'CONSOLIDATED'
    book_name VARCHAR(100) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    currency VARCHAR(3) NOT NULL DEFAULT 'AED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_book_type UNIQUE(legal_entity_id, book_type)
);

-- 4. Fixed Asset Depreciation Schedules
CREATE TABLE IF NOT EXISTS fixed_asset_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    asset_id UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
    period_date DATE NOT NULL,
    depreciation_amount_base BIGINT NOT NULL,
    accumulated_depreciation_base BIGINT NOT NULL,
    net_book_value_base BIGINT NOT NULL,
    is_posted BOOLEAN NOT NULL DEFAULT FALSE,
    journal_entry_id UUID REFERENCES journal_entries(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. IFRS 15 Revenue Contracts & Performance Obligations
CREATE TABLE IF NOT EXISTS ifrs15_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    contract_number VARCHAR(100) NOT NULL,
    contract_name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_contract_value_base BIGINT NOT NULL,
    recognized_revenue_base BIGINT NOT NULL DEFAULT 0,
    deferred_revenue_base BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'COMPLETED', 'CANCELLED'
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_contract_number UNIQUE(legal_entity_id, contract_number)
);

CREATE TABLE IF NOT EXISTS ifrs15_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    contract_id UUID NOT NULL REFERENCES ifrs15_contracts(id) ON DELETE CASCADE,
    milestone_name VARCHAR(255) NOT NULL,
    milestone_value_base BIGINT NOT NULL,
    completion_percentage INT NOT NULL DEFAULT 0,
    is_satisfied BOOLEAN NOT NULL DEFAULT FALSE,
    satisfied_date DATE,
    journal_entry_id UUID REFERENCES journal_entries(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. IFRS 16 Lease Amortization Schedules
CREATE TABLE IF NOT EXISTS lease_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    contract_id UUID NOT NULL REFERENCES lease_contracts(id) ON DELETE CASCADE,
    period_month INT NOT NULL,
    payment_base BIGINT NOT NULL,
    principal_base BIGINT NOT NULL,
    interest_base BIGINT NOT NULL,
    closing_liability_base BIGINT NOT NULL,
    rou_depreciation_base BIGINT NOT NULL,
    is_posted BOOLEAN NOT NULL DEFAULT FALSE,
    journal_entry_id UUID REFERENCES journal_entries(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_lease_schedule_month UNIQUE(contract_id, period_month)
);

-- 7. Payroll Runs & WPS Employee Records
CREATE TABLE IF NOT EXISTS payroll_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    period_year INT NOT NULL,
    period_month INT NOT NULL,
    total_employees INT NOT NULL DEFAULT 0,
    total_gross_base BIGINT NOT NULL DEFAULT 0,
    total_net_base BIGINT NOT NULL DEFAULT 0,
    sif_file_name VARCHAR(255),
    sif_content TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'APPROVED', 'SIF_GENERATED', 'DISBURSED'
    journal_entry_id UUID REFERENCES journal_entries(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_payroll_period UNIQUE(legal_entity_id, period_year, period_month)
);

CREATE TABLE IF NOT EXISTS payroll_employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id VARCHAR(50) NOT NULL,
    employee_name VARCHAR(255) NOT NULL,
    labor_card_number VARCHAR(50),
    iban VARCHAR(34) NOT NULL,
    fixed_salary_base BIGINT NOT NULL,
    variable_salary_base BIGINT NOT NULL DEFAULT 0,
    deductions_base BIGINT NOT NULL DEFAULT 0,
    net_salary_base BIGINT NOT NULL,
    eosg_accrued_base BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Migration Ingestion Logs (Zoho / QuickBooks / Tally)
CREATE TABLE IF NOT EXISTS migration_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    source_system VARCHAR(50) NOT NULL, -- 'ZOHO', 'QUICKBOOKS', 'TALLY'
    import_type VARCHAR(50) NOT NULL, -- 'COA', 'BALANCES', 'VENDORS', 'CUSTOMERS', 'ALL'
    filename VARCHAR(255) NOT NULL,
    raw_payload JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED', -- 'PENDING', 'COMPLETED', 'FAILED'
    records_imported INT NOT NULL DEFAULT 0,
    records_failed INT NOT NULL DEFAULT 0,
    error_log TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. Subscriptions & Usage Metering
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    plan_tier VARCHAR(50) NOT NULL DEFAULT 'ENTERPRISE', -- 'STARTER', 'GROWTH', 'ENTERPRISE'
    is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
    max_entities INT NOT NULL DEFAULT 10,
    max_monthly_invoices INT NOT NULL DEFAULT 10000,
    billing_cycle_start DATE NOT NULL,
    billing_cycle_end DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_subscription UNIQUE(tenant_id)
);

CREATE TABLE IF NOT EXISTS usage_metering (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    period_month VARCHAR(7) NOT NULL, -- '2026-01'
    invoices_created INT NOT NULL DEFAULT 0,
    ai_tokens_consumed INT NOT NULL DEFAULT 0,
    api_calls_count INT NOT NULL DEFAULT 0,
    wps_transmissions_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_usage_period UNIQUE(tenant_id, period_month)
);

-- 10. Enable Row Level Security (RLS) on all new tables
ALTER TABLE bill_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_book_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_asset_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE ifrs15_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ifrs15_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE lease_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_metering ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_bill_approvals ON bill_approvals FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_payment_allocations ON payment_allocations FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_multi_book_ledgers ON multi_book_ledgers FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_fixed_asset_schedules ON fixed_asset_schedules FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_ifrs15_contracts ON ifrs15_contracts FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_ifrs15_milestones ON ifrs15_milestones FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_lease_schedules ON lease_schedules FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_payroll_runs ON payroll_runs FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_payroll_employees ON payroll_employees FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_migration_imports ON migration_imports FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_tenant_subscriptions ON tenant_subscriptions FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_usage_metering ON usage_metering FOR ALL USING (tenant_id = app.get_current_tenant_id());
