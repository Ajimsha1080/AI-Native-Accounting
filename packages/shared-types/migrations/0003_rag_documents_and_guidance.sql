-- Migration 0003: pgvector Guidance and Contract RAG Store
-- Rule: Use pgvector RAG only for contracts, documents and loaded guidance.
-- ARITHMETIC AND FINANCIAL TOTALS MUST NEVER USE VECTOR RAG (must use deterministic SQL).

CREATE TABLE IF NOT EXISTS guidance_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    document_type VARCHAR(50) NOT NULL, -- 'FTA_GUIDELINE', 'LEASE_CONTRACT', 'SUPPLIER_CONTRACT'
    title VARCHAR(255) NOT NULL,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    embedding_vector TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE guidance_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_guidance_documents ON guidance_documents 
    FOR ALL USING (tenant_id = app.get_current_tenant_id());
