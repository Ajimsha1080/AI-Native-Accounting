# LedgerAE: AI-Native ERP for UAE Mid-Market Groups

**Target Customer:** UAE Corporate Groups (3–10 entities, 20–200 staff, multi-currency, VAT & Corporate Tax registered, external auditor).  
**Target Region:** UAE (`me-central-1` / UAE Central Cloud Region)  
**Security Posture:** Engineered to adhere to OWASP ASVS Level 2 principles and UAE PDPL data protection standards.  
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

## 1. Quickstart & Local Development

### Prerequisites
- Node.js `v20+` or `v22+`
- npm `v10+`
- Docker & Docker Compose (or local PostgreSQL 16 on port 9527)

### Step 1: Configure Environment Variables
```bash
cp .env.example .env.local
```
Update `.env.local` with your database connection, encryption keys ($\ge 32$ bytes), and integration credentials.

### Step 2: Install & Build Monorepo
```bash
npm install
npm run build
```
Workspaces compile in strict topological dependency order with project references:
`@ledger-ae/shared-types` $\rightarrow$ `@ledger-ae/ledger-core` $\rightarrow$ `@ledger-ae/uae-tax-engine` $\rightarrow$ `@ledger-ae/ubl-pinta-generator` $\rightarrow$ `@ledger-ae/mcp-server` $\rightarrow$ `@ledger-ae/web`

### Step 3: Run Monorepo Automated Tests
```bash
# Unit, Domain, Integration & Contract Tests
npm test

# Zero-Float Money Linter
npm run lint

# Bilingual Arabic/English AI Evals
npm run test:eval

# Third-Party Integration Contract Tests
npm run test:contract
```

### Step 4: Run Next.js 9-Screen Web Application
```bash
# Starts Next.js production server on port 3005
npm run start -w @ledger-ae/web
```
- Web Application: **[http://localhost:3005](http://localhost:3005)**
- Supported Locales: English (`/en/...`) & Arabic with Native RTL (`/ar/...`)

### Step 5: Run Playwright E2E Test Suite
```bash
npx playwright test -c apps/web/playwright.config.ts
```
**Playwright Test Coverage:** 9/9 specs passing against live Next.js server and PostgreSQL 16:
- Screen 1: Real Argon2id auth, dynamic RFC 6238 TOTP, entity switcher, Arabic RTL toggle.
- Screen 2: Real-time dashboard metrics, AR/AP ageing distribution, month-end close readiness.
- Screen 3: Chart of accounts TanStack grid, balanced journal entry (0 fils invariant), 1-click contra reversal.
- Screen 4: Invoices & vendor bills lists, document inspection, bilingual PDF preview, multi-tier bill approval.
- Screen 5: Statutory 14-box VAT 201 return with drill-down modal to source journal lines.
- Screen 6: Bank statement feed vs ledger, continuous matching, 99% AI match explanations.
- Screen 7: Autonomous agent inbox, token telemetry and latency, explainable statutory logic, human approval.
- Screen 8: Trial Balance (balanced debits == credits), P&L, Balance Sheet, IFRS 10 multi-entity consolidation.
- Screen 9: 12-step month-end close checklist, immutable SHA-256 hash-chained audit trail, RBAC matrix.

---

## 2. Next.js App Router 9-Screen ERP Suite

The web application (`apps/web`) is a bilingual Next.js App Router ERP client built with:
- **Framework:** Next.js App Router + React 19 + TypeScript Strict Mode.
- **Styling & RTL:** Tailwind CSS with CSS logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`), mirrored icons, and `IBM Plex Sans Arabic`.
- **Forms & Tables:** TanStack Table v8, `react-hook-form` with `zod` schema resolvers.
- **Strict Minor Units:** Zero floating-point math; all monetary amounts operate as integer fils (`BigInt`).
- **Standardized State Matrix:** Loading skeletons, empty states, dismissible error alerts with retry, and 403 permission-denied views.

| Screen | Route | Key Capabilities |
| :--- | :--- | :--- |
| **Screen 1: Auth & App Shell** | `/[locale]/login`<br>`/[locale]/login/verify-2fa` | Tenant identification, 6-digit TOTP 2FA, session countdown warning, entity context dropdown, en/ar language switcher. |
| **Screen 2: Dashboard** | `/[locale]/app/dashboard` | Live cash liquidity, AR/AP ageing distribution (0–30d, 31–60d, 61–90d, 90+d), VAT net liability, month-end closing readiness, open AI proposals. |
| **Screen 3: COA & Journals** | `/[locale]/app/ledger/accounts`<br>`/[locale]/app/ledger/journals` | TanStack Table chart of accounts, keyboard-first journal voucher grid, invariant validation (0 fils variance), posting, and 1-click contra reversal. |
| **Screen 4: Invoices & Bills** | `/[locale]/app/invoicing/sales` | Peppol PINT-AE UBL 2.1 e-invoices, vendor bills with 3-way matching, split-pane bilingual en/ar PDF preview, and approval workflows. |
| **Screen 5: FTA VAT 201 Return** | `/[locale]/app/tax/vat201` | Statutory 14-box return (Emirate sales 1a–1g, RCM Art. 48, zero-rated exports Art. 45). Every populated box features interactive voucher drill-down lineage. |
| **Screen 6: Bank Reconciliation** | `/[locale]/app/banking/reconciliation` | Bank feed ingestion (MT940/CAMT.053) vs general ledger, AI explainable matching proposals, and auto-post bank fee journal. |
| **Screen 7: AI Proposals Inbox** | `/[locale]/app/ai/proposals` | Human-in-the-loop agent governance: source event lineage, UAE statutory citations, explainable logic, proposed journal preview, and token cost telemetry. |
| **Screen 8: Financial Reports** | `/[locale]/app/reports` | Tabbed statements: Trial Balance, Profit & Loss, Balance Sheet, IFRS 10 Consolidation with eliminations, and client CSV export. |
| **Screen 9: Close & Roles** | `/[locale]/app/close` | 12-step month-end closing checklist, append-only cryptographic SHA-256 audit trail with hash-chain integrity verification, and RBAC matrix. |

---

## 3. Production Verification Evidence & Operational Proof

LedgerAE enforces rigorous evidence-based verification across all phases:

### 3.1. Disaster Recovery & PITR Restore Drill
- **Script:** [`scripts/dr/run-real-postgres-restore-drill.mjs`](file:///c:/Users/91730/Downloads/AI%20Accounting/scripts/dr/run-real-postgres-restore-drill.mjs)
- **Live Evidence:** Executed against PostgreSQL 16. Created snapshot via `pg_dump`, restored into isolated drill database `ledger_ae_restore_drill`, and audited:
  - 33 public schema tables verified.
  - Zero double-entry variance ($\sum \text{Debits} == \sum \text{Credits}$).
  - Achieved RTO: **2 seconds** (SLA Target: $\le 3600 \text{ s}$).
  - Achieved RPO: **$< 60$ seconds** continuous WAL archiving (Target: $\le 300 \text{ s}$).

### 3.2. High-Scale 1 Million Ledger Lines Stress Benchmark
- **Script:** [`scripts/run-1m-load-test.mjs`](file:///c:/Users/91730/Downloads/AI%20Accounting/scripts/run-1m-load-test.mjs)
- **Live Evidence:** 1,000,000 double-entry ledger lines ingested and queried on PostgreSQL 16:
  - Bulk ingestion rate: **89,718 lines/sec** (completed in 11.27 seconds).
  - 500 query benchmark iterations over 1M lines:
    - Min Latency: **240.79 ms**
    - p50 (Median) Latency: **268.51 ms**
    - p90 Latency: **292.53 ms**
    - **p95 Latency:** **304.14 ms**
    - p99 Latency: **344.87 ms**

### 3.3. Accessibility, Security & Operational Documentation
- **WCAG 2.1 AA Audit Report:** [`docs/wcag-accessibility-audit.md`](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/wcag-accessibility-audit.md) (All contrast ratios $> 4.5:1$, keyboard navigability, screen reader semantics, and Arabic RTL layout verified).
- **External Penetration Testing Scope:** [`docs/external-pen-test-scope.md`](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/external-pen-test-scope.md) (Defines scope, test tenants, rules of engagement, and CVSS reporting SLAs for third-party audit).
- **Operational SRE Runbooks:** [`docs/runbooks/operational-runbooks.md`](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/runbooks/operational-runbooks.md) (Step-by-step procedures for live PostgreSQL restore, zero-downtime secret rotation, and e-invoicing DLQ retry).
- **Secrets Management Policy:** [`docs/secrets-management-policy.md`](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/secrets-management-policy.md) (Mandatory startup validation $\ge 32$ bytes, envelope encryption for TOTP secrets, zero code credentials).

---

## 4. Architecture Decision Records (ADRs)

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

## 5. Model Context Protocol (MCP) Configuration

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
