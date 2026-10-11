-- Migration 0002: Operations Schema
-- Invoices, Bills, Vendors, Customers, Payments, Bank Statements/Lines, Reconciliations, VAT Returns, E-Invoices, ASP Messages, AI Proposals, Fixed Assets, Leases, Payroll, Outbox

-- 1. Vendors
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    vendor_number VARCHAR(50) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    trn VARCHAR(15),
    payment_terms_days INT NOT NULL DEFAULT 30,
    currency VARCHAR(3) NOT NULL DEFAULT 'AED',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_vendor_number UNIQUE(legal_entity_id, vendor_number)
);

-- 2. Customers
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    customer_number VARCHAR(50) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    trn VARCHAR(15),
    credit_limit_base BIGINT DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'AED',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_customer_number UNIQUE(legal_entity_id, customer_number)
);

-- 3. Sales Invoices
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(100) NOT NULL,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'AED',
    subtotal_txn BIGINT NOT NULL,
    vat_total_txn BIGINT NOT NULL,
    total_txn BIGINT NOT NULL,
    subtotal_base BIGINT NOT NULL,
    vat_total_base BIGINT NOT NULL,
    total_base BIGINT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'POSTED', 'PAID', 'CANCELLED'
    einvoice_status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'CLEARED', 'REJECTED'
    ubl_xml_hash VARCHAR(64),
    journal_entry_id UUID REFERENCES journal_entries(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_invoice_number UNIQUE(legal_entity_id, invoice_number)
);

-- 4. Vendor Bills
CREATE TABLE IF NOT EXISTS bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    bill_number VARCHAR(100) NOT NULL,
    vendor_invoice_number VARCHAR(100) NOT NULL,
    bill_date DATE NOT NULL,
    due_date DATE NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'AED',
    subtotal_txn BIGINT NOT NULL,
    vat_total_txn BIGINT NOT NULL,
    total_txn BIGINT NOT NULL,
    subtotal_base BIGINT NOT NULL,
    vat_total_base BIGINT NOT NULL,
    total_base BIGINT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    match_status VARCHAR(50) NOT NULL DEFAULT 'UNMATCHED', -- 'MATCHED_3WAY', 'VARIANCE', 'UNMATCHED'
    journal_entry_id UUID REFERENCES journal_entries(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_bill_number UNIQUE(legal_entity_id, bill_number)
);

-- 5. Payments
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    payment_number VARCHAR(100) NOT NULL,
    payment_type VARCHAR(20) NOT NULL, -- 'INBOUND_CUSTOMER', 'OUTBOUND_VENDOR'
    partner_id UUID NOT NULL,
    payment_date DATE NOT NULL,
    amount_txn BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'AED',
    amount_base BIGINT NOT NULL,
    journal_entry_id UUID REFERENCES journal_entries(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_payment_number UNIQUE(legal_entity_id, payment_number)
);

-- 6. Bank Statements & Statement Lines
CREATE TABLE IF NOT EXISTS bank_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    statement_identifier VARCHAR(100) NOT NULL,
    opening_balance_base BIGINT NOT NULL,
    closing_balance_base BIGINT NOT NULL,
    statement_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_bank_statement UNIQUE(legal_entity_id, statement_identifier)
);

CREATE TABLE IF NOT EXISTS bank_statement_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    statement_id UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    amount_txn BIGINT NOT NULL,
    direction VARCHAR(10) NOT NULL, -- 'CREDIT', 'DEBIT'
    reference VARCHAR(255),
    narrative TEXT NOT NULL,
    is_reconciled BOOLEAN NOT NULL DEFAULT FALSE,
    reconciled_journal_line_id UUID REFERENCES journal_lines(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. VAT Returns
CREATE TABLE IF NOT EXISTS vat_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    tax_period_year INT NOT NULL,
    tax_period_quarter INT NOT NULL,
    box_1a_net_base BIGINT NOT NULL DEFAULT 0,
    box_1a_vat_base BIGINT NOT NULL DEFAULT 0,
    box_1b_net_base BIGINT NOT NULL DEFAULT 0,
    box_1b_vat_base BIGINT NOT NULL DEFAULT 0,
    box_1c_net_base BIGINT NOT NULL DEFAULT 0,
    box_1c_vat_base BIGINT NOT NULL DEFAULT 0,
    box_1d_net_base BIGINT NOT NULL DEFAULT 0,
    box_1d_vat_base BIGINT NOT NULL DEFAULT 0,
    box_1e_net_base BIGINT NOT NULL DEFAULT 0,
    box_1e_vat_base BIGINT NOT NULL DEFAULT 0,
    box_1f_net_base BIGINT NOT NULL DEFAULT 0,
    box_1f_vat_base BIGINT NOT NULL DEFAULT 0,
    box_1g_net_base BIGINT NOT NULL DEFAULT 0,
    box_1g_vat_base BIGINT NOT NULL DEFAULT 0,
    box_3_net_base BIGINT NOT NULL DEFAULT 0,
    box_3_vat_base BIGINT NOT NULL DEFAULT 0,
    box_4_net_base BIGINT NOT NULL DEFAULT 0,
    box_9_net_base BIGINT NOT NULL DEFAULT 0,
    box_9_vat_base BIGINT NOT NULL DEFAULT 0,
    box_10_net_base BIGINT NOT NULL DEFAULT 0,
    box_10_vat_base BIGINT NOT NULL DEFAULT 0,
    net_vat_payable_base BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'FILED', 'AMENDED'
    filed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_vat_period UNIQUE(legal_entity_id, tax_period_year, tax_period_quarter)
);

-- 8. E-Invoices and ASP Messages
CREATE TABLE IF NOT EXISTS einvoice_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    message_type VARCHAR(50) NOT NULL, -- 'PINT_AE_380', 'PINT_AE_381'
    transmission_status VARCHAR(50) NOT NULL, -- 'ACCEPTED', 'REJECTED', 'QUEUED_DLQ'
    asp_tracking_id VARCHAR(100),
    clearance_reference VARCHAR(100),
    archive_hash VARCHAR(64) NOT NULL,
    archive_payload TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. AI Proposals and Action Logs
CREATE TABLE IF NOT EXISTS ai_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    proposal_type VARCHAR(50) NOT NULL, -- 'BANK_REC_MATCH', 'INVOICE_LINE_CODING', 'MONTH_END_ACCRUAL'
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_REVIEW', -- 'PENDING_REVIEW', 'APPROVED', 'REJECTED'
    confidence_score INT NOT NULL, -- 0 to 100
    statutory_basis TEXT,
    proposal_payload JSONB NOT NULL,
    approved_by UUID REFERENCES users(id),
    posted_journal_entry_id UUID REFERENCES journal_entries(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id UUID REFERENCES legal_entities(id),
    model_id VARCHAR(100) NOT NULL,
    prompt_tokens INT NOT NULL DEFAULT 0,
    completion_tokens INT NOT NULL DEFAULT 0,
    cost_fils BIGINT NOT NULL DEFAULT 0,
    action_type VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. Fixed Assets & IFRS 16 Leases
CREATE TABLE IF NOT EXISTS fixed_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    asset_number VARCHAR(100) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    acquisition_date DATE NOT NULL,
    acquisition_cost_base BIGINT NOT NULL,
    useful_life_months INT NOT NULL,
    salvage_value_base BIGINT NOT NULL DEFAULT 0,
    accumulated_depreciation_base BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_asset_number UNIQUE(legal_entity_id, asset_number)
);

CREATE TABLE IF NOT EXISTS lease_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
    contract_number VARCHAR(100) NOT NULL,
    commencement_date DATE NOT NULL,
    lease_term_months INT NOT NULL,
    monthly_payment_base BIGINT NOT NULL,
    annual_discount_rate_bps INT NOT NULL,
    rou_asset_initial_base BIGINT NOT NULL,
    lease_liability_initial_base BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_lease_number UNIQUE(legal_entity_id, contract_number)
);

-- 11. Transactional Outbox Events
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PUBLISHED', 'FAILED'
    retry_count INT NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RLS Enforcement on Operations Tables
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE einvoice_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE lease_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_vendors ON vendors FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_customers ON customers FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_invoices ON invoices FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_bills ON bills FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_payments ON payments FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_bank_statements ON bank_statements FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_bank_statement_lines ON bank_statement_lines FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_vat_returns ON vat_returns FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_einvoice_messages ON einvoice_messages FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_ai_proposals ON ai_proposals FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_ai_action_logs ON ai_action_logs FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_fixed_assets ON fixed_assets FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_lease_contracts ON lease_contracts FOR ALL USING (tenant_id = app.get_current_tenant_id());
CREATE POLICY tenant_isolation_outbox_events ON outbox_events FOR ALL USING (tenant_id = app.get_current_tenant_id());
