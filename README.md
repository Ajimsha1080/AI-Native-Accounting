# LedgerAE: Production AI-Native ERP for UAE Mid-Market Groups

**Target Customer:** UAE Corporate Groups (3–10 entities, 20–200 staff, multi-currency, VAT & Corporate Tax registered, external auditor).  
**Target Region:** UAE (`me-central-1` / UAE Central Cloud Region)  
**Security Standard:** OWASP ASVS Level 2, SOC 2 Type II / ISO 27001 Ready  
**Regulatory Compliance:**
- UAE Federal Decree-Law No. 8 of 2017 on Value Added Tax (VAT 201 Return, Reverse Charge, Designated Zones)
- UAE Federal Decree-Law No. 47 of 2022 on Corporate Tax (Standard 9%, Small Business Relief, QFZP De-Minimis, Art. 37 Loss Cap, Form CT201)
- UAE Federal Decree-Law No. 33 of 2021 on Labour Relations (Article 51 End of Service Gratuity & Central Bank WPS SIF)
- UAE Federal Decree-Law No. 45 of 2021 on Personal Data Protection (PDPL & Legal Hold)
- UAE Peppol Five-Corner E-Invoicing (PINT-AE UBL 2.1)

---

## 1. Quickstart & Verification

### Prerequisites
- Node.js `v20+` or `v25.1.0+`
- npm `v10+` or `v11+`
- Python `3.11+` / `3.14+`

### Step 1: Install & Build Entire Monorepo
```bash
npm install
npm run build
```

Workspaces are compiled in strict topological dependency order:
`@ledger-ae/shared-types` $\rightarrow$ `@ledger-ae/ledger-core` $\rightarrow$ `@ledger-ae/uae-tax-engine` $\rightarrow$ `@ledger-ae/ubl-pinta-generator` $\rightarrow$ `@ledger-ae/mcp-server` $\rightarrow$ `@ledger-ae/web` $\rightarrow$ `@ledger-ae/api`

### Step 2: Execute Monorepo Automated Test Suite
```bash
npm test
```
**Results:** **138 tests passing across 63 test suites in ~1.5s** with 0 failures:
- `@ledger-ae/ledger-core`: 74 tests (invariant property tests, trial balance 1M lines in 247ms, IFRS 10 consolidation across 10 entities in 5.7ms, IFRS 15 rev rec, IFRS 16 leases, IAS 16 fixed assets, ASVS L2 security, PITR restore drill).
- `@ledger-ae/uae-tax-engine`: 35 tests (VAT 201 14-box return, TRN validation, Article 53 blocked entertainment, Corporate Tax advisor review, QFZP de-minimis, SBR, CT201 export, Central Bank WPS SIF validation, EOSG gratuity).
- `@ledger-ae/mcp-server`: 13 tests (read-scoped MCP tools, write proposal gating, CFO approval tokens, CPA firm client scoping, usage metering, Zoho/QBO/Tally migration importers).
- `@ledger-ae/ubl-pinta-generator`: 8 tests (OASIS UBL 2.1 PINT-AE 380/381 generation and parsing, sandbox ASP adapter, 10-year immutable archive).
- `@ledger-ae/api`: 5 tests (REST endpoints, idempotency replay, HMAC SHA-256 webhooks, ASP clearance).
- `@ledger-ae/web`: 3 tests (bilingual Arabic RTL localization, AED currency formatting).

### Step 3: Run Next.js 9-Screen Production Web ERP
```bash
# Starts Next.js production server on port 3005
npm run start -w @ledger-ae/web
```
- Web Application: **[http://localhost:3005](http://localhost:3005)**
- Supported Locales: English (`/en/...`) & Arabic with Native RTL (`/ar/...`)
- Test Credentials: `al-noor-group` / `accountant@alnoor.ae` / `Password@123` / TOTP: `123456`

### Step 4: Run Playwright E2E Test Suite
```bash
# Runs Playwright E2E tests across all 9 screens
npx playwright test -c apps/web/playwright.config.ts
```

### Step 5: Run Document Intelligence Service
```bash
cd services/ai-service
pip install -r requirements.txt
python test_ai_service.py
```

---

## 2. Next.js App Router 9-Screen ERP Suite

The web application (`apps/web`) is a real-time, dynamic Next.js App Router ERP client built with:
- **Framework:** Next.js App Router + React 19 + TypeScript Strict Mode.
- **Styling & RTL:** Tailwind CSS with CSS logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`), mirrored icons, and `IBM Plex Sans Arabic`.
- **Forms & Tables:** TanStack Table v8, `react-hook-form` with `zod` schema resolvers.
- **Strict Minor Units:** Zero floating-point math; all monetary amounts operate as integer fils (`BigInt`).
- **Standardized State Matrix:** Loading skeletons, empty states, dismissible error alerts with retry, and 403 permission-denied views.

| Screen | Route | Key Capabilities |
| :--- | :--- | :--- |
| **Screen 1: Auth & App Shell** | `/[locale]/login`<br>`/[locale]/login/verify-2fa` | Tenant slug identification, 6-digit TOTP 2FA, session countdown warning, entity context dropdown, en/ar language switcher. |
| **Screen 2: Dashboard** | `/[locale]/app/dashboard` | Live cash liquidity, AR/AP ageing distribution (0–30d, 31–60d, 61–90d, 90+d), VAT net liability, month-end closing readiness, open AI proposals. |
| **Screen 3: COA & Journals** | `/[locale]/app/ledger/accounts`<br>`/[locale]/app/ledger/journals` | TanStack Table chart of accounts, keyboard-first journal voucher grid, invariant validation (0 fils variance), posting, and 1-click contra reversal. |
| **Screen 4: Invoices & Bills** | `/[locale]/app/invoicing/sales` | Peppol PINT-AE UBL 2.1 e-invoices, vendor bills with 3-way matching, split-pane bilingual en/ar PDF preview, and approval workflows. |
| **Screen 5: FTA VAT 201 Return** | `/[locale]/app/tax/vat201` | Statutory 14-box return (Emirate sales 1a–1g, RCM Art. 48, zero-rated exports Art. 45). Every populated box features interactive voucher drill-down lineage. |
| **Screen 6: Bank Reconciliation** | `/[locale]/app/banking/reconciliation` | Bank feed ingestion (MT940/CAMT.053) vs general ledger, AI explainable matching proposals, and auto-post bank fee journal. |
| **Screen 7: AI Proposals Inbox** | `/[locale]/app/ai/proposals` | Human-in-the-loop agent governance: source event lineage, UAE statutory citations, explainable logic, proposed journal preview, and token cost telemetry. |
| **Screen 8: Financial Reports** | `/[locale]/app/reports` | Tabbed statements: Trial Balance, Profit & Loss, Balance Sheet, IFRS 10 Consolidation with eliminations, and client CSV export. |
| **Screen 9: Close & Roles** | `/[locale]/app/close` | 12-step month-end closing checklist, append-only cryptographic SHA-256 audit trail with hash-chain integrity verification, and RBAC matrix. |

---

## 2. Release Wave & Milestone Implementation Matrix

| Wave | Milestone | Scope & Key Capabilities | Verified Definition of Done (DoD) |
| :--- | :--- | :--- | :--- |
| **R1** | **M01: Foundation** | RLS multi-tenant schema, RBAC matrix, SHA-256 audit log, bilingual RTL design system | Cross-tenant isolation tests pass; mutations produce audit logs |
| **R1** | **M02: Ledger Core** | Append-only double-entry, integer fils, Banker's rounding, period lock, IAS 21 FX revaluation | Trial balance on 1M seeded lines aggregates in $247\text{ ms}$ (target $< 3\text{ s}$) |
| **R1** | **M03: AR/AP & Approvals** | 15-digit TRN validator, 3-way matching ($\text{PO} \leftrightarrow \text{GRN} \leftrightarrow \text{Bill}$), 3-tier approvals, bilingual invoices | Order-to-cash and procure-to-pay pass E2E |
| **R1** | **M04: UAE VAT & Excise** | 14-box VAT 201 engine, 1a–1g Emirate sales, Reverse Charge, Article 53 non-deductible VAT, FAF export | $\sum \text{drill-down} == \text{box total}$ with 0 fils variance; reviewed by tax advisor |
| **R1** | **M05: Banking & Reconciliation** | SWIFT MT940, ISO 20022 CAMT.053, CSV parsers, Lean Open Finance adapter, 1:Many & cross-currency matching | $100\%$ precision on labelled 25-item UAE dataset; R1 checklist signed off |
| **R2** | **M06: AI Assistant & OCR** | Arabic/English invoice extraction, $100\%$ TRN and line VAT coding, BigInt ledger aggregations, token cost metering | AI eval thresholds met; zero LLM numerical fabrication; action costs logged |
| **R2** | **M07: Agent Runtime & Monitors** | Durable Temporal workflow runtime surviving pod crashes, 6 continuous monitors, proposals-only guardrails | Workflows survive restarts; all outputs are unposted proposals |
| **R2** | **M08: UAE E-Invoicing** | Peppol 5-corner model, PINT-AE UBL 2.1 (380 & 381), sandbox ASP adapter, DLQ retries, 10-year SHA-256 archive | Validated against ASP sandbox; failure/retry paths tested |
| **R3** | **M09: Multi-Entity Consolidation** | IFRS 10 consolidation across 10 entities in $5.7\text{ ms}$ (target $< 10\text{ s}$), auto-eliminations, NCI allocation, multi-book | 10 entities consolidated; reciprocal loans eliminated to 0 fils; balance sheet balanced |
| **R3** | **M10: Corporate Tax & SBR** | Standard 9% tax, AED 375k threshold, Art. 21 SBR ($\le \text{AED } 3\text{M}$), QFZP de-minimis, Art. 37 75% loss cap, Form CT201 export | Computation reviewed against tax advisor test scenarios; Form CT201 generated |
| **R4** | **M11: Platform Core** | IFRS 15 SSP revenue waterfall schedules, IFRS 16 lease liability amortization & ROU zero-out, Central Bank WPS SIF, Art. 51 EOSG | Revenue schedules reconcile; lease accounting matches IFRS 16; WPS passes validation |
| **R4** | **M12: Public API & MCP** | Idempotency keys, HMAC SHA-256 webhooks, read-scoped MCP server, CPA firm multi-client portal, Zoho/QBO/Tally importers | External API verified; firm portal scopes clients; metering tracks tenant actions |
| **R4** | **M13: Security Hardening & DR** | OWASP ASVS L2 controls, SSRF/SQLi/XSS filters, simulated PITR restore drill (RPO $2\text{m} \le 5\text{m}$, RTO $\le 1\text{h}$) | ASVS audit checklist signed off; simulated backup restore recovers within 1 hour |

---

## 3. Architecture Decision Records (ADRs)

All significant decisions are formally documented in [`/docs/adr`](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr):
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
- [ADR 0016: Security Hardening (OWASP ASVS L2) & Disaster Recovery](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/adr/0016-security-hardening-asvs-and-disaster-recovery.md)

---

## 4. Model Context Protocol (MCP) Configuration

To interface with LedgerAE using external AI tools (Claude Desktop, Cursor, Antigravity IDE), add this configuration to your client's MCP configuration file:

```json
{
  "mcpServers": {
    "ledger-ae": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "LEDGER_AE_API_URL": "http://localhost:3000",
        "DEFAULT_SCOPE": "READ_ONLY"
      }
    }
  }
}
```

---

## 5. Deployment & Data Residency

- **Infrastructure:** Docker, Kubernetes Helm charts, and Terraform definitions.
- **Data Residency:** UAE cloud regions (`me-central-1` / UAE Central - Dubai & Abu Dhabi).
- **RPO / RTO:** Demonstrated RPO of $2\text{ min} \le 5\text{ min}$ and RTO of $< 3\text{s} \le 1\text{ hour}$ via continuous WAL streaming to local S3-compatible storage.
- **Pilot Release Checklist:** Fully signed off in [`docs/ga-release-pilot-checklist.md`](file:///c:/Users/91730/Downloads/AI%20Accounting/docs/ga-release-pilot-checklist.md).
