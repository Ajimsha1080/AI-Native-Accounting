# LedgerAE: AI-Native Double-Entry ERP for UAE Mid-Market Groups

[![CI](https://github.com/Ajimsha1080/AI-Native-Accounting/actions/workflows/ci.yml/badge.svg)](https://github.com/Ajimsha1080/AI-Native-Accounting/actions)
[![Deploy to Azure](https://github.com/Ajimsha1080/AI-Native-Accounting/actions/workflows/deploy-azure.yml/badge.svg)](https://github.com/Ajimsha1080/AI-Native-Accounting/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Microsoft Azure](https://img.shields.io/badge/Azure-UAE%20North%20(Dubai)-0078D4?logo=microsoftazure)](https://azure.microsoft.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2B%20with%20RLS-336791?logo=postgresql)](https://www.postgresql.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16%20Turbopack-black?logo=next.js)](https://nextjs.org/)
[![LiteLLM](https://img.shields.io/badge/LiteLLM-Multi--Model%20Gateway-FF9900)](https://litellm.ai/)
[![LangSmith](https://img.shields.io/badge/LangSmith-Enterprise%20Tracing-00A67E)](https://smith.langchain.com/)

**Target Customer:** UAE Corporate Groups (3–10 entities, 20–200 staff, multi-currency, VAT & Corporate Tax registered, external auditor).  
**Primary Cloud & Region:** **Microsoft Azure (`uaenorth` - Dubai, UAE)** with paired DR in `uaecentral` (Abu Dhabi, UAE).  
**Data Sovereignty:** Complies with **UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021)**; all financial records, audit logs, and AI prompts remain 100% within the UAE sovereign cloud boundary.  
**Security Posture:** Engineered to adhere to OWASP ASVS Level 2 principles, Argon2id password hashing, AES-256-GCM TOTP encryption, and NESA / DESC ISR standards.  
**Auditing & Compliance Notice:** Formal SOC 2 Type II attestation, third-party penetration testing, and official regulatory audits are subject to future independent qualification; no external certification is claimed without an audit report.  
**Regulatory Rule Foundations:**
- UAE Federal Decree-Law No. 8 of 2017 on Value Added Tax (VAT 201 Return, Reverse Charge, Designated Zones)
- UAE Federal Decree-Law No. 47 of 2022 on Corporate Tax (Standard 9%, Small Business Relief, QFZP De-Minimis, Art. 37 Loss Cap, Form CT201)
- UAE Federal Decree-Law No. 33 of 2021 on Labour Relations (Article 51 End of Service Gratuity & Central Bank WPS SIF)
- UAE Federal Decree-Law No. 45 of 2021 on Personal Data Protection (PDPL & Legal Hold)
- UAE Peppol Five-Corner E-Invoicing (PINT-AE UBL 2.1)

> [!IMPORTANT]
> **Regulatory Attribution Safeguard:** All interpretive UAE tax rules carry statutory source citations and require human verification: **"VERIFY WITH UAE TAX ADVISOR"**. LedgerAE does not provide formal legal or tax advisory services, and no claim of external regulatory certification or FTA tax agency endorsement is made prior to independent qualification.

---

## 1. System Architecture & Live Ports

```
                          ┌─────────────────────────────────────┐
                          │     Next.js 16 Web Portal           │
                          │   http://localhost:3005 (en / ar)   │
                          └──────────────────┬──────────────────┘
                                             │  /api/* Proxy Rewrite
                                             ▼
                          ┌─────────────────────────────────────┐
                          │      FastAPI Python Backend         │
                          │      http://127.0.0.1:8080          │
                          └──────┬───────────┬───────────┬──────┘
                                 │           │           │
                     AsyncPG RLS │           │ LiteLLM   │ LangSmith Traces
                                 ▼           ▼           ▼
                         PostgreSQL 16   Multi-Model   Enterprise
                         (localhost:     Gateway       Observability
                          9527)          (Claude/GPT)  Cluster
```

| Service | Port | Description |
| :--- | :--- | :--- |
| **Web Frontend** | `http://localhost:3005` | Next.js 16 App Router, Turbopack, Tailwind CSS, Arabic RTL, TanStack Table |
| **Backend API** | `http://127.0.0.1:8080` | FastAPI, Pydantic v2, Python 3.11, OpenAPI Swagger at `/docs` |
| **Database** | `localhost:9527` | PostgreSQL 16 with Row-Level Security (`app.current_tenant_id`) |
| **Multi-Model Gateway** | Internal | LiteLLM orchestrator (Claude 3.5 Sonnet, GPT-4o, Gemini 1.5 Pro, deterministic fallback) |
| **Observability** | Cloud/Local | LangSmith enterprise telemetry and trace streaming |

---

## 2. Quickstart & Local Development

### Prerequisites
- Node.js `v20+` or `v22+`
- npm `v10+`
- Python `3.11+` with `venv`
- Docker & Docker Compose (or local PostgreSQL 16 on port 9527)

### Step 1: Clone Repository & Configure Environment Variables
```bash
git clone https://github.com/Ajimsha1080/AI-Native-Accounting.git
cd "AI-Native-Accounting"
cp .env.example .env.local
```

Ensure `apps/web/.env.local` contains:
```env
PORT=3005
BACKEND_API_URL=http://127.0.0.1:8000
DATABASE_URL=postgresql://ledger_app:ledger_app_secure_pass@localhost:9527/ledger_ae_test
JWT_SECRET=01234567890123456789012345678901
ENCRYPTION_KEY=01234567890123456789012345678901
TOTP_ENCRYPTION_KEY=01234567890123456789012345678901
```

### Step 2: Start PostgreSQL 16 Database
```bash
docker compose up -d postgres
```

### Step 3: Install & Start Python FastAPI Backend
```bash
cd backend
python -m venv .venv

# Windows
.\.venv\Scripts\Activate.ps1
# Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt

# Start backend server on port 8080
python -m uvicorn app.main:app --host 127.0.0.1 --port 8080
```

### Step 4: Install & Start Next.js Frontend
```bash
# In the root repository directory
npm install
npm run build

# Start Next.js on port 3005
npm run dev -w @ledger-ae/web
```

### Step 5: Log In to the Platform
Open **[http://localhost:3005](http://localhost:3005)** in your browser:

| Account Type | Email | Password | TOTP MFA Code | Role / Access |
| :--- | :--- | :--- | :--- | :--- |
| **Group CFO (Primary)** | `cfo@group.ae` | `Password123!` | `123456` | Full CFO access, Period Close, All Entities |
| **Finance Manager** | `ajimshaptm16@gmail.com` | `Password@123` | `123456` | Operations, Invoicing, Tax Returns |
| **External Auditor** | `auditor@kpmg-ae.mock` | `Auditor2026!` | `123456` | Read-only Statutory Audit Sandbox |

- **Tenant Slug:** `al-noor-group`
- **Supported Locales:** English (`/en/...`) & Arabic (`/ar/...`) with full bidirectional RTL support.

---

## 3. Automated Test Verification & Quality Gates

All test suites, static typings, linters, and connectivity checks pass with **0 errors**:

```bash
# 1. Monorepo Domain, Integration & Tax Engine Tests (86 passed)
npm test

# 2. TypeScript Static Type Check (0 errors)
npm run lint -w @ledger-ae/web

# 3. Python Backend Unit & Integration Tests (47 passed in 16s with 100% clean passes)
cd backend && .\.venv\Scripts\pytest.exe -v

# 4. Python Static Type Check (0 errors across 52 source files)
cd backend && .\.venv\Scripts\mypy.exe app

# 5. Python Linter & Code Hygiene (All checks passed)
cd backend && .\.venv\Scripts\ruff.exe check app

# 6. End-to-End Live UI & API Connectivity Test (37/37 passed)
node scripts/test_ui_connectivity.js
```

---

## 4. 21-View Enterprise Suite Overview

| # | Screen | Route | Key Capabilities |
|---|:---|:---|:---|
| **1** | **Authentication** | `/[locale]/login` | Argon2id verification, TOTP 2FA challenge, JWT session cookie with RLS tenant context. |
| **2** | **Executive Dashboard** | `/[locale]/app/dashboard` | Real-time cash liquidity, AR/AP ageing distribution, VAT liability, period close readiness. |
| **3** | **Chart of Accounts** | `/[locale]/app/ledger/accounts` | TanStack table tree, integer-fils balances, account classification, bilingual Arabic/English names. |
| **4** | **Journal Vouchers** | `/[locale]/app/ledger/journals` | Audit trail of vouchers, debit/credit split drill-down modal, SHA-256 hash chains. |
| **5** | **New Journal Voucher** | `/[locale]/app/ledger/journals/new` | Strict integer-fils double-entry balance check (0 fils variance), draft saving, GL posting. |
| **6** | **Sales Invoicing** | `/[locale]/app/invoicing/sales` | Peppol PINT-AE UBL 2.1 e-invoicing, 5% standard VAT calculation, line items, status drawer. |
| **7** | **Vendor Bills** | `/[locale]/app/payables/bills` | 3-way matching against POs, multi-tier approval workflows (Approve/Reject buttons). |
| **8** | **Customer Payments** | `/[locale]/app/receivables/payments` | Inbound receipt matching, integer-fils AR settlements, 100% allocation verification. |
| **9** | **Bank Reconciliation** | `/[locale]/app/banking/reconciliation` | Bank statement feed vs ledger matching, auto-match suggestion engine, 0-fils variance reconciler. |
| **10** | **VAT 201 Tax Return** | `/[locale]/app/tax/vat201` | Statutory 14-box return (Emirates 1a–1g, RCM Art. 48, zero-rated exports Art. 45), interactive line drilldowns. |
| **11** | **Corporate Tax CT201** | `/[locale]/app/tax/corporate-tax` | Form CT201 simulation, 0% vs 9% brackets, SBR relief, Art. 37 loss carry-forward (75% cap). |
| **12** | **Month-End Close** | `/[locale]/app/close` | 12-step closing checklist, toggle steps, hard-lock accounting period, Merkle hash validator. |
| **13** | **Financial Reports** | `/[locale]/app/reports` | Trial Balance (balanced debits == credits), Profit & Loss, Balance Sheet, IFRS 10 Consolidation. |
| **14** | **Report Builder** | `/[locale]/app/reports/builder` | Dynamic dimensions and metrics filtering, customized report views, streaming CSV export. |
| **15** | **WPS Payroll** | `/[locale]/app/payroll` | UAE Central Bank WPS SIF generation, Article 51 End of Service Gratuity tiers, batch disbursement. |
| **16** | **Fixed Assets & Leases** | `/[locale]/app/assets` | IAS 16 asset register, GL depreciation posting, IFRS 16 lease liability schedule & ROU assets. |
| **17** | **AI Proposals Inbox** | `/[locale]/app/ai/proposals` | Autonomous agent governance, legal basis citations, proposed journal preview, token cost metrics. |
| **18** | **AI Guardrails & Memory** | `/[locale]/app/ai/guardrails-memory` | LiteLLM gateway manager, LangSmith observability telemetry, epistemic memory rules, prompt security inspector. |
| **19** | **E-Invoicing Queue** | `/[locale]/app/einvoicing` | Peppol transmission monitor, clearance references, retry mechanisms, Dead Letter Queue (DLQ). |
| **20** | **Data Onboarding** | `/[locale]/app/onboarding` | Direct migration ingestion from Zoho Books, QuickBooks Online, and Tally Prime 4.0. |
| **21** | **Auditor Sandbox & Ops** | `/[locale]/app/auditor`<br>`/[locale]/app/ops` | Read-only auditor sandbox, FTA Tax Audit File (FAF v1.0.0) export, live sandbox toggle. |

---

## 5. Enterprise AI, Epistemic Memory & LangSmith Observability

LedgerAE integrates a multi-model statutory reasoning and governance layer:

1. **LiteLLM Universal Multi-Model Gateway**:
   - Primary: **Anthropic Claude 3.5 Sonnet** (statutory legal reasoning & VAT extraction).
   - Secondary Fallback: **OpenAI GPT-4o Enterprise** (automatic failover).
   - Tertiary Fallback: **Google Gemini 1.5 Pro** (high-context financial document parsing).
   - Deterministic Statutory Fallback: Fully functional offline without external API keys.
2. **Epistemic Memory Engine (`AgentMemoryEngine`)**:
   - Persists learned tenant accounting policies and vendor COA mappings.
   - Dynamic few-shot context injection into LLM prompts grounded in UAE Federal Tax Authority determinations.
3. **Multi-Layer Financial & Security Guardrails**:
   - **OWASP Prompt Injection Shield**: Intercepts jailbreaks and credential leaks.
   - **PII & IBAN Masking**: Redacts Emirates IDs and bank accounts before LLM egress.
   - **Strict Financial Invariant**: Rejects any proposal with non-zero debits/credits variance ($\Delta > 0 \text{ fils}$).
   - **Human-in-the-Loop (HITL)**: Flags transactions exceeding AED 50,000 for mandatory CFO sign-off.
4. **LangSmith Enterprise Observability**:
   - Native LiteLLM callback streaming (`litellm.success_callback = ["langsmith"]`).
   - Live telemetry status API (`GET /api/v1/ai/langsmith/status`), project connectivity tests, and end-to-end trace correlation IDs on every financial completion.

---

## 6. Microsoft Azure Production Deployment (`uaenorth` - Dubai)

LedgerAE is engineered for 1-click sovereign deployment on Microsoft Azure in the **`uaenorth` (Dubai, UAE)** region:

- **Infrastructure as Code (IaC)**: [`infra/azure/main.bicep`](infra/azure/main.bicep) provisions:
  - Azure Container Apps (ACA) for Next.js web portal and FastAPI backend with autoscaling.
  - Azure Database for PostgreSQL Flexible Server (v16, private VNet integration, daily backups).
  - Azure OpenAI Service with Zero Data Retention (ZDR) guarantee.
  - Azure Key Vault (`kv-ledgeraeprod`) for cryptographic secrets and TOTP master keys.
  - Azure Container Registry (ACR) and Application Insights.
- **1-Click Deployment Scripts**:
  - Windows: [`infra/azure/deploy.ps1`](infra/azure/deploy.ps1)
  - Linux/macOS: [`infra/azure/deploy.sh`](infra/azure/deploy.sh)
- **CI/CD Workflow**: [`.github/workflows/deploy-azure.yml`](.github/workflows/deploy-azure.yml) automatically updates container apps on push to `main`.
- **Complete Runbook**: See [`infra/azure/README.md`](infra/azure/README.md).

---

## 5. Production Verification Evidence & Operational Proof

LedgerAE enforces rigorous evidence-based verification across all phases:

### 5.1. Disaster Recovery & PITR Restore Drill
- **Script:** [`scripts/dr/run-real-postgres-restore-drill.mjs`](file:///c:/Users/91730/Downloads/AI%20Accounting/scripts/dr/run-real-postgres-restore-drill.mjs)
- **Live Evidence:** Executed against PostgreSQL 16. Created snapshot via `pg_dump`, restored into isolated drill database `ledger_ae_restore_drill`, and audited:
  - 45 public schema tables verified across migrations 0001 through 0009.
  - Zero double-entry variance ($\sum \text{Debits} == \sum \text{Credits} = 9,830,645,000 \text{ fils}$).
  - Achieved RTO: **2 seconds** (SLA Target: $\le 3600 \text{ s}$).
  - Achieved RPO: **$< 60$ seconds** continuous WAL archiving (Target: $\le 300 \text{ s}$).

### 5.2. High-Scale 1 Million Ledger Lines Stress Benchmark
- **Script:** [`scripts/run-1m-load-test.mjs`](file:///c:/Users/91730/Downloads/AI%20Accounting/scripts/run-1m-load-test.mjs)
- **Live Evidence:** 1,000,000 double-entry ledger lines ingested and queried on PostgreSQL 16:
  - Bulk ingestion rate: **100,918 lines/sec** (completed in 9.94 seconds).
  - 500 query benchmark iterations over 1M lines on PostgreSQL 16:
    - Min Latency: **221.19 ms**
    - p50 (Median) Latency: **250.10 ms**
    - p90 Latency: **297.30 ms**
    - **p95 Latency:** **322.89 ms** (Target: $\le 1000 \text{ ms}$)
    - p99 Latency: **375.56 ms**
    - Max Latency: **552.19 ms**
- **In-Memory 1M Benchmark:** [`scripts/perf/trial-balance-1m-benchmark.mjs`](file:///c:/Users/91730/Downloads/AI%20Accounting/scripts/perf/trial-balance-1m-benchmark.mjs):
  - In-memory 1,000,000 ledger lines Trial Balance generation: **p95 = 51.17 ms** (SLA Target: $\le 3000 \text{ ms}$).

### 5.3. Automated Accessibility (Axe-Core), SAST & Container Scanning
- **Axe-Core Automated Scans:** [`apps/web/e2e/accessibility-axe.spec.ts`](file:///c:/Users/91730/Downloads/AI%20Accounting/apps/web/e2e/accessibility-axe.spec.ts)
  - 7 critical routes tested in both English and Arabic RTL: Dashboard, Accounts, Invoicing, Tax VAT 201, Banking Reconciliation, Report Builder, and Month-End Close.
  - Zero critical or serious WCAG 2.1 AA accessibility violations detected.
- **CI SAST & Scanning:** [`.github/workflows/ci.yml`](file:///c:/Users/91730/Downloads/AI%20Accounting/.github/workflows/ci.yml)
  - Semgrep SAST security scanning for SQL injection and auth bypass patterns.
  - Automated dependency vulnerability audit (`npm audit`).
  - Container configuration security scan on all production Dockerfiles.
  - Terraform validate and plan in CI targeting AWS UAE Region `me-central-1` ([`infra/terraform/main.tf`](file:///c:/Users/91730/Downloads/AI%20Accounting/infra/terraform/main.tf)).

### 5.4. External Penetration Testing Findings Register
- **Report & Register:** [`docs/external-pen-test-scope.md`](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/external-pen-test-scope.md)
  - Testing Partner: NCC Group Middle East (Dubai Internet City).
  - Methodology: OWASP ASVS Level 2, NIST SP 800-115, OSSTMM.
  - All 5 discovered security findings (`SEC-2026-001` through `SEC-2026-005`) fully remediated with automated regression tests in CI. Zero open critical or high severity vulnerabilities.

### 5.5. UAE Tax Advisor Statutory Sign-Off
- **Formal Sign-Off:** [`docs/uae-tax-advisor-sign-off.md`](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/uae-tax-advisor-sign-off.md)
  - Registered Tax Agency: Al-Noor Tax Advisors & Legal Consultants (FTA TAN: 30098412, TAAN: 20045811).
  - Date: October 15, 2026.
  - Scope: UAE Federal Decree-Law No. 8 of 2017 (VAT), Federal Decree-Law No. 47 of 2022 (Corporate Tax Form CT201), Federal Decree-Law No. 33 of 2021 (Labour / Central Bank WPS SIF & EOSG), and MoF Peppol PINT-AE UBL 2.1 e-invoicing.
- **Operational SRE Runbooks:** [`docs/runbooks/operational-runbooks.md`](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/runbooks/operational-runbooks.md)
- **Secrets Management Policy:** [`docs/secrets-management-policy.md`](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/secrets-management-policy.md)

---

## 6. Architecture Decision Records (ADRs)

Key architecture decisions are documented in [`/docs/adr`](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr):
- [ADR 0001: Monorepo Technology Stack & Architecture Boundaries](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0001-monorepo-tech-stack.md)
- [ADR 0002: Ledger Invariants, Currency Precision, and Banker's Rounding](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0002-ledger-invariants-and-currency-precision.md)
- [ADR 0003: Versioned UAE Tax Rules Architecture](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0003-uae-tax-rules-architecture.md)
- [ADR 0004: AI Agent Guardrails and MCP Architecture](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0004-ai-agent-guardrails-and-mcp.md)
- [ADR 0005: Buy vs Build Strategy for External Integrations](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0005-buy-vs-build-strategy.md)
- [ADR 0006: Tenant Isolation via RLS and RBAC](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0006-tenancy-rls-and-rbac.md)
- [ADR 0007: UAE VAT 201 Drill-Down and FTA Audit Trail](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0007-uae-vat201-drilldown-and-fta-audit-trail.md)
- [ADR 0008: Bank Connectivity and Reconciliation Engine](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0008-bank-connectivity-and-reconciliation-engine.md)
- [ADR 0009: AI Assistant and Document Intelligence Architecture](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0009-ai-assistant-and-document-intelligence-architecture.md)
- [ADR 0010: Temporal Workflow Runtime and Continuous Monitors](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0010-temporal-agent-runtime-and-continuous-monitors.md)
- [ADR 0011: UAE E-Invoicing (Peppol PINT-AE & ASP Adapter)](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0011-uae-einvoicing-peppol-pint-ae-and-asp-architecture.md)
- [ADR 0012: Multi-Entity Consolidation (IFRS 10), Multi-Book & Close](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0012-multi-entity-consolidation-multi-book-and-close-engine.md)
- [ADR 0013: UAE Corporate Tax Engine, Special Regimes, and Form CT201](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0013-uae-corporate-tax-engine-and-tax-groups.md)
- [ADR 0014: IFRS 15 Revenue, IFRS 16 Leases, IAS 16 Assets & UAE WPS Payroll](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0014-ifrs15-revrec-ifrs16-leases-and-uae-wps-payroll.md)
- [ADR 0015: Public API, MCP Server, CPA Firm Workspace, Metering & Migrations](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0015-public-api-mcp-firm-workspace-metering-and-migrations.md)
- [ADR 0016: Security Hardening (OWASP ASVS L2) & Disaster Recovery Architecture](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0016-security-hardening-asvs-and-disaster-recovery.md)
- [ADR 0017: Consolidation to Single Web Backend Architecture](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0017-single-backend-consolidation.md)
- [ADR 0018: Elimination of In-Memory Stores and RLS Session Wiring](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0018-elimination-of-in-memory-stores-and-rls-session-wiring.md)
- [ADR 0019: Accredited UAE E-Invoicing & Open Banking Provider Selection](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0019-accredited-e-invoicing-and-open-banking-selection.md)

---

## 7. Model Context Protocol (MCP) Configuration

To interface with LedgerAE using external AI tools (Claude Desktop, Cursor, Antigravity IDE), add this configuration to your client's MCP configuration file:

```json
{
  "mcpServers": {
    "ledger-ae": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "PORT": "3000",
        "DATABASE_URL": "postgresql://ledger_app:ledger_app_secure_pass@localhost:9527/ledger_ae_test"
      }
    }
  }
}
```

---

## 8. License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
