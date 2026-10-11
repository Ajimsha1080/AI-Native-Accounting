# ADR 0006: Tenancy Context, PostgreSQL Row-Level Security (RLS), and RBAC Scoping

## Status
Accepted

## Context
LedgerAE targets UAE corporate groups operating multiple entities (mainland LLCs, free zone entities, and ADGM/DIFC SPVs). The system must enforce:
1. Strict multi-tenant isolation where tenant data cannot leak under any application or ORM query bug.
2. Fine-grained Role-Based Access Control (RBAC) with 4-tier scoping:
   - Tenant level (Organization)
   - Entity level (Legal entity / subsidiary)
   - Account level (Sensitive payroll / executive accounts)
   - Action / Amount level (Approval thresholds)
3. Cryptographic and non-repudiable audit logging for every data mutation (before/after state diff, actor IP, role, and AI involvement metadata).
4. Compliance with UAE Federal Decree-Law No. 45 of 2021 regarding Personal Data Protection (PDPL) and data sovereignty (`me-central-1`).

## Decision
1. **PostgreSQL Row-Level Security (RLS)**:
   - Every database transaction must establish the tenant context via session configuration variables (`app.current_tenant_id`, `app.current_user_id`, `app.current_entity_id`).
   - Every table contains `tenant_id NOT NULL REFERENCES tenants(id)`.
   - Postgres policies enforce `USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)`.
   - Direct automated tests must execute cross-tenant queries to prove that queries with foreign entity or record IDs return 0 rows.

2. **Hierarchical RBAC & Segregation of Duties (SoD)**:
   - Standard roles: `OWNER`, `CFO`, `FINANCIAL_CONTROLLER`, `SENIOR_ACCOUNTANT`, `JUNIOR_ACCOUNTANT`, `EXTERNAL_AUDITOR`, `TAX_AGENT`, `VIEWER`.
   - Enforcement of Segregation of Duties in code: creators of journal vouchers, bills, or payment runs are strictly prevented from approving their own entries.

3. **Audit Log System**:
   - Every mutating request is intercepted and writes an immutable record to `audit_logs` containing:
     - Actor UUID, role, and tenant context.
     - HTTP IP address and user-agent.
     - JSONB snapshot of `payload_before` and `payload_after`.
     - Deterministic SHA-256 diff hash verifying tamper resistance.
     - AI metadata flag (`is_ai_initiated`, `agent_name`, `confidence_score`).

## Consequences
- Guaranteed mathematical and database-level multi-tenant security.
- Eliminates risk of cross-company data leakage during group financial consolidation.
- Enables external auditors to inspect an immutable evidence trail for statutory sign-off.
