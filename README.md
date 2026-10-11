# LedgerAE: AI-Native ERP for UAE Mid-Market Groups

**Target Customer:** UAE Corporate Groups (3–10 entities, 20–200 staff, multi-currency, VAT & Corporate Tax registered, external auditor).  
**Target Region:** UAE (`me-central-1` / UAE Central Cloud Region)  
**Security Posture:** Built in alignment with OWASP ASVS Level 2 principles, SOC 2 Type II controls, and UAE PDPL data protection.  
**Regulatory Rule Foundations:**
- UAE Federal Decree-Law No. 8 of 2017 on Value Added Tax (VAT 201 Return, Reverse Charge, Designated Zones)
- UAE Federal Decree-Law No. 47 of 2022 on Corporate Tax (Standard 9%, Small Business Relief, QFZP De-Minimis, Art. 37 Loss Cap, Form CT201)
- UAE Federal Decree-Law No. 33 of 2021 on Labour Relations (Article 51 End of Service Gratuity & Central Bank WPS SIF)
- UAE Federal Decree-Law No. 45 of 2021 on Personal Data Protection (PDPL & Legal Hold)
- UAE Peppol Five-Corner E-Invoicing (PINT-AE UBL 2.1)

> [!IMPORTANT]
> **Regulatory Attribution Safeguard:** All interpretive UAE tax rules carry statutory source citations and require human verification: **"VERIFY WITH UAE TAX ADVISOR"**. LedgerAE does not provide formal legal or tax advisory services, and no claim of external regulatory certification is made prior to independent qualification.

---

## 1. Quickstart & Local Development

### Prerequisites
- Node.js `v20+` or `v22+`
- npm `v10+`
- Docker & Docker Compose (for local PostgreSQL, Redis, MinIO, and Temporal)

### Step 1: Configure Environment Variables
```bash
cp .env.example .env.local
```
Update `.env.local` with your local development passwords, encryption keys, and external service sandbox credentials.

### Step 2: Install & Build Monorepo
```bash
npm install
npm run build
```

Workspaces are compiled in strict topological dependency order:
`@ledger-ae/shared-types` $\rightarrow$ `@ledger-ae/ledger-core` $\rightarrow$ `@ledger-ae/uae-tax-engine` $\rightarrow$ `@ledger-ae/ubl-pinta-generator` $\rightarrow$ `@ledger-ae/mcp-server` $\rightarrow$ `@ledger-ae/web` $\rightarrow$ `@ledger-ae/api`

### Step 3: Run Monorepo Automated Tests
```bash
npm test
```
**Current Test Coverage:** 188 unit, domain, and integration tests across 65 suites with 0 failures:
- `@ledger-ae/ledger-core`: Invariant property tests, Banker's rounding, trial balance aggregation, IFRS 10 multi-entity consolidation, IFRS 15 rev-rec, IFRS 16 leases, IAS 16 fixed assets, ASVS Level 2 security hardening, DR restore drill.
- `@ledger-ae/uae-tax-engine`: VAT 201 14-box return, TRN validation, Article 53 blocked entertainment, Corporate Tax calculations, QFZP de-minimis, SBR, CT201 export, Central Bank WPS SIF validation, EOSG gratuity.
- `@ledger-ae/shared-types`: Schema validation, PostgreSQL RLS tenant isolation, SoD role matrices, fast-check property-based invertibility tests.
- `@ledger-ae/mcp-server`: Scoped MCP tools, proposal gating, usage metering, Zoho/QBO/Tally migration parsers.
- `@ledger-ae/ubl-pinta-generator`: OASIS UBL 2.1 PINT-AE 380/381 generation and parsing, sandbox ASP adapter, 10-year immutable archive.
- `@ledger-ae/web`: Full 9-screen Playwright E2E suite passing in both English and Arabic RTL.

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

## 3. Engineering & Production Transformation Roadmap

The repository is undergoing a structured transformation from domain prototype to multi-tenant production SaaS, as detailed in [`docs/gap-analysis.md`](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/gap-analysis.md):

| Phase | Focus Area | Key Objectives |
| :--- | :--- | :--- |
| **Phase 0** | **Truth, Hygiene & CI** | Remove committed buildinfo/pyc, .gitignore fixes, parameterized compose, CI pipeline (GitHub Actions). |
| **Phase 1** | **Persistence** | PostgreSQL 16 migrations, RLS enforcement (`SET LOCAL app.current_tenant_id`), repository layer. |
| **Phase 2** | **Auth & RBAC** | Argon2id hashing, RFC 6238 TOTP with encrypted secrets, signed JWT/session store, `withAuth` middleware. |
| **Phase 3** | **Single Backend** | Retire `apps/api` via ADR 0017; rewire all Next.js route handlers to shared domain services. |
| **Phase 4** | **Zero-Float Money** | Implement string decimal parser, eliminate floats from parsers/WPS, add property tests and ESLint rule. |
| **Phase 5** | **Real AI Engine** | Anthropic Claude SDK with tool use, Zod structured outputs, prompt evals on labelled UAE dataset. |
| **Phase 6** | **Durable Workflows** | Temporal SDK for month-end close and retries; PostgreSQL transactional outbox for signed webhooks. |
| **Phase 7** | **Integrations** | PINT-AE ASP sandbox, Lean/Tarabut bank aggregator, Stripe billing contract tests. |
| **Phase 8** | **Hardened MCP** | Official MCP SDK, scoped tokens, server-signed single-use approval grants. |
| **Phase 9** | **Feature Completion** | Bills/vendors, payments, multi-book consolidation, fixed assets, IFRS 15/16, audit viewer. |
| **Phase 10** | **Production Ops** | Dockerfiles, Terraform UAE cloud configs, Sentry/OTel, PITR restore drill, 1M-line load tests. |

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

---

## 5. Model Context Protocol (MCP) Configuration

To interface with LedgerAE using external AI tools (Claude Desktop, Cursor, Antigravity IDE), add this configuration to your client's MCP configuration file:

```json
{
  "mcpServers": {
    "ledger-ae": {
      "command": "node",
      "args": ["packages/mcp-server/dist/server.js"],
      "env": {
        "PORT": "3000",
        "DATABASE_URL": "postgresql://ledger_app:secret@localhost:5432/ledger_ae"
      }
    }
  }
}
```
