# LedgerAE: Comprehensive Threat Model & Security Architecture

**Frameworks:** STRIDE, OWASP Top 10 (2021), UAE PDPL (Federal Decree-Law No. 45 of 2021), ISO/IEC 27001  
**Target Security Posture:** SOC 2 Type II / ISO 27001 readiness with banking-grade isolation.

---

## 1. System Assets & Sensitivity Classification

| Asset | Sensitivity | Compliance Controls |
| :--- | :--- | :--- |
| **Financial Ledgers & Journals** | Critical | Append-only immutability, RLS, cryptographic audit hashes |
| **Corporate Tax & VAT Filings** | Confidential | UAE Data Residency (`me-central-1`), Role-gated read/write |
| **Bank Feeds & IBAN Credentials** | Secret | AES-GCM-256 field encryption, secrets manager, mutual TLS |
| **Invoices & Customer/Vendor PII** | Confidential | UAE PDPL controls, right-to-be-forgotten redaction policies |
| **AI LLM Prompts & Extracted Data** | Confidential | Zero data retention agreements, tenant isolation, no training |
| **E-Invoicing Cryptographic Keys** | Secret | HSM / KMS hardware-backed signing, strict key rotation |

---

## 2. STRIDE Threat Analysis & Mitigations

### 2.1 Spoofing (Identity & Authenticity)
- **Threat:** Attacker impersonates an accounting manager or auditor to approve fraudulent payment runs or forge journal entries.
- **Mitigation:**
  - Mandatory Multi-Factor Authentication (MFA / TOTP) and UAE PASS SSO integration.
  - Short-lived JWT access tokens (15 mins) coupled with cryptographically signed refresh tokens stored in Redis with fingerprint validation.
  - Segregation of Duties (SoD) enforced in software: the creator of a payment run or journal cannot approve it.

### 2.2 Tampering (Data Integrity)
- **Threat 1: Cross-Tenant Data Leakage or Modification**
  - An attacker manipulates tenant identifiers in REST payloads to view or update another company's ledger.
  - *Mitigation:* Strict PostgreSQL Row-Level Security (RLS) on every table, keyed to `app.current_tenant_id` session variable set by server-side middleware. Direct automated integration tests verify that cross-tenant queries return zero records even with valid IDs.
- **Threat 2: Ledger Mutation & Retroactive Balance Alteration**
  - A malicious insider or compromised DB admin alters historical journal amounts to conceal fraud or underreport VAT.
  - *Mitigation:*
    - Append-only database triggers preventing `UPDATE` and `DELETE` on `journal_entries` and `journal_lines`.
    - Every transaction incorporates a SHA-256 cryptographic hash chaining to the previous journal entry sequence, creating an immutable merkle chain.
    - Closed accounting periods enforce hard cryptographic locks.

### 2.3 Repudiation
- **Threat:** User claims they did not initiate or approve a multi-million AED tax filing or journal write-off.
- **Mitigation:**
  - Immutable audit logs capturing: `user_id`, `tenant_id`, `actor_role`, `ip_address`, `user_agent`, `timestamp_utc`, `action_type`, `before_state_hash`, `after_state_hash`, `ai_involvement_metadata`.
  - Evidence packs exported with digital cryptographic signatures.

### 2.4 Information Disclosure (Confidentiality & Privacy)
- **Threat 1: Data Sovereignity Breach (UAE PDPL Non-Compliance)**
  - Financial records or PII transit through or are stored in non-UAE regions.
  - *Mitigation:* Cloud resources (AWS `me-central-1` UAE or Azure UAE Central), databases, S3 buckets, and OpenSearch clusters are pinned exclusively to UAE data centers.
- **Threat 2: LLM Data Exposure / Training Leakage**
  - Sensitive customer invoices sent to AI APIs are cached or used to train third-party models.
  - *Mitigation:* Zero Data Retention (ZDR) commercial agreements with Anthropic. Prompts are transmitted strictly over TLS 1.3 with transient memory processing. No tenant data is ever mixed in fine-tuning or shared vectors.

### 2.5 Denial of Service (Availability)
- **Threat:** Heavy aggregation queries (e.g. 5-year General Ledger recalculations across thousands of cost centers) or spamming OCR endpoints exhausts API workers.
- **Mitigation:**
  - Token-bucket rate limiting via Redis per IP and per tenant.
  - Heavy calculations (multi-entity consolidations, close checklist auto-evaluations, OCR) execute as background Temporal jobs, isolated from the synchronous REST API thread pool.
  - Database read-replicas for read-heavy financial statements and analytical queries.

### 2.6 Elevation of Privilege
- **Threat:** Junior bookkeeper escalates role permissions to bypass approval limits or access executive payroll entries.
- **Mitigation:**
  - Granular Role-Based Access Control (RBAC) and Attribute-Based Access Control (ABAC) verified at the NestJS service layer.
  - Amount-based hierarchical approvals (e.g., bills $$> \text{AED } 50,000$$ require Controller sign-off; $$> \text{AED } 250,000$$ require CFO sign-off).
  - Model Context Protocol (MCP) server endpoints enforce read-only scopes by default; write endpoints require multi-factor re-authentication tokens.

---

## 3. Threat Matrix & Risk Ratings

| ID | Threat Vector | Target | Severity | Impact | Mitigation Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Multi-tenant RLS bypass via SQLi or un-scoped ORM query | Journal Lines | Critical | Catastrophic data breach | Addressed (PostgreSQL RLS + parameterized Prisma/Kysely queries) |
| **SEC-02** | LLM prompt injection manipulating financial classifications | AI Bill OCR / Agent | High | Incorrect VAT coding / tax fraud | Addressed (Deterministic validation rules engine intercepts all AI proposals) |
| **SEC-03** | Unauthorized retroactive journal entry in locked period | General Ledger | Critical | Falsification of statutory books | Addressed (DB-level append-only trigger + period lock validation) |
| **SEC-04** | PII / Financial leakage via public LLM logging | AI Gateway | High | UAE PDPL violation | Addressed (Zero data retention, redaction of sensitive IDs, local OCR) |
| **SEC-05** | Man-in-the-Middle on E-invoicing ASP transmission | PINT-AE UBL | High | Tampered tax invoices | Addressed (Mutual TLS 1.3 + OASIS UBL digital signatures) |
