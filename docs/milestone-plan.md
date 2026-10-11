# LedgerAE: Implementation Milestone Plan & Acceptance Criteria

**Standard Operating Procedure:**
- One milestone executed at a time.
- After each milestone: unit/integration tests run, linter checks, typecheck verified, architectural summary provided.
- Stop and wait for user's explicit `"continue"` before advancing to the subsequent milestone.

---

## Milestone Roadmap

### Milestone 1: Foundation & Core Tenancy
- **Scope:**
  - Monorepo setup (`apps/api`, `apps/web`, `packages/ledger-core`, `packages/uae-tax-engine`, `packages/shared-types`).
  - Multi-tenant architecture with PostgreSQL Row-Level Security (RLS).
  - RBAC engine (Owner, Controller, Accountant, Auditor, Tax Agent) and audit logging system.
  - Next.js 15 UI shell with full RTL (Right-to-Left) Arabic and English i18n support, design tokens, and dense TanStack Table setup.
- **Acceptance Criteria:**
  - Automated tests proving cross-tenant query isolation under RLS (0 leaked records).
  - Audit log intercepts all CRUD actions with user IP, role, and timestamp.
  - Web UI toggles seamlessly between English (LTR) and Arabic (RTL) with proper numeral formatting (AED).
  - 100% typecheck and lint passing.

---

### Milestone 2: Ledger Core, Multi-Currency, Period Lock & Invariant Tests
- **Scope:**
  - Append-only event-sourced journal engine (`packages/ledger-core`).
  - BigInt minor-currency arithmetic and deterministic banker's rounding.
  - Hard mathematical invariants ($$\sum \text{Debits} = \sum \text{Credits}$$ in both txn currency and base AED).
  - Multi-currency conversion, FX gain/loss line generation, and accounting period hard/soft locking.
- **Acceptance Criteria:**
  - Invariant property-based tests (10,000 randomized permutations) verifying zero floating-point errors and debits == credits balance.
  - Attempting to post into a locked period throws deterministic `PeriodLockedException`.
  - Database rejects any `UPDATE` or `DELETE` on posted journal entries.
  - > 90% test coverage on `packages/ledger-core`.

---

### Milestone 3: Order-to-Cash (AR), Procure-to-Pay (AP) & Approval Workflows
- **Scope:**
  - Customers, Invoices, Credit Notes, and AR Subledger posting.
  - Vendors (with UAE TRN format validation), Purchase Orders, Goods Receipt Notes, and Vendor Bills.
  - 3-Way Matching engine ($$\text{PO} \leftrightarrow \text{GRN} \leftrightarrow \text{Bill}$$) with configurable variance tolerances.
  - Amount-based approval hierarchy (e.g. $$\le 10\text{k}$$, $$\le 50\text{k}$$, $$> 50\text{k}$$ AED).
- **Acceptance Criteria:**
  - Invoices and Bills automatically post balanced entries to Accounts Receivable / Accounts Payable subledgers.
  - 3-Way match blocks payment approval on quantity or price discrepancies beyond threshold.
  - Full audit trail of approvals with segregation of duties validation.

---

### Milestone 4: UAE Tax & Compliance Suite (VAT 201 & Excise Tax)
- **Scope:**
  - Versioned, data-driven rules module (`packages/uae-tax-engine`) with statutory citations (Federal Decree-Law No. 8 of 2017).
  - Standard (5%), Zero-rated (0%), Exempt, Out of Scope, and Reverse Charge Mechanism (RCM Art. 48).
  - Designated Free Zone goods transfer rules.
  - VAT 201 Return calculation engine with full drill-down to underlying journal vouchers.
  - Excise tax rates and reporting.
  - "VERIFY WITH UAE TAX ADVISOR" safeguards on interpretive rules.
- **Acceptance Criteria:**
  - Generating VAT 201 produces identical box totals matching FTA calculation logic.
  - Clicking any box (e.g., Box 1 Standard Rated Supplies or Box 3 RCM) lists exact source journal entries.
  - Property tests on partial input tax recovery formulas.

---

### Milestone 5: Banking & Reconciliation Engine
- **Scope:**
  - Bank statement parser (MT940, CAMT.053, CSV) and mock Open-Finance connector.
  - Rule-based reconciliation engine (1:1, 1:Many, Many:Many) and cross-currency reconciliation with automatic realized FX posting.
  - Discrepancy resolution workflows.
- **Acceptance Criteria:**
  - Reconciling multi-currency transactions calculates exact realized FX gain/loss down to the fil.
  - Unmatched transactions surfaced with suggested candidate matches and confidence scores.

---

### Milestone 6: Continuous Close Management & Financial Report Builder
- **Scope:**
  - Close checklist engine with task assignments, dependencies, and period progress tracker.
  - Fixed Asset Register with straight-line depreciation runs, prepaid amortisation, and accruals engine.
  - Dynamic Financial Statement Builder (Balance Sheet, P&L, Trial Balance, Cash Flow) with drill-down to source vouchers.
- **Acceptance Criteria:**
  - Closing an accounting period verifies all required checklist items are marked complete.
  - Depreciation and amortisation schedules automatically generate draft adjusting journal entries.
  - Financial reports reconcile with zero variance against the underlying General Ledger.

---

### Milestone 7: AI Assistant & Document Intelligence (OCR)
- **Scope:**
  - Dual-language Arabic & English invoice/receipt OCR service (FastAPI + PyMuPDF/EasyOCR).
  - Line-item extraction, TRN validation, and automated expense account & VAT code proposals.
  - Accounting Copilot: plain-English Q&A answering financial queries using deterministic parameterized SQL queries.
  - Anthropic Claude tool-use integration with Zero Data Retention safeguards.
- **Acceptance Criteria:**
  - OCR accurately extracts bilingual invoice amounts, TRN, and line items into draft bills.
  - AI Assistant always returns the exact query/logic used and links to underlying transactions (no hallucinated figures).
  - CI evaluation harness tests OCR and categorization accuracy against labeled UAE invoices.

---

### Milestone 8: Autonomous Agents Runtime & Continuous AI Monitors
- **Scope:**
  - Temporal workflow runtime for long-running AI agents.
  - User-configurable natural language agents (e.g. Month-end unbilled expense accrual agent).
  - Continuous background monitors: duplicate bill detector, missing TRN scanner, anomalous VAT code checker, FX outlier alert.
  - Human-in-the-loop proposals queue with configurable auto-approval thresholds.
- **Acceptance Criteria:**
  - Continuous monitors flag injected duplicate bills and abnormal VAT codes with actionable proposal tasks.
  - Agents strictly emit `DraftProposal` objects and cannot directly write to posted ledgers without human/policy sign-off.
  - Every agent action records prompt versions, execution latency, and token costs in audit tables.

---

### Milestone 9: UAE E-Invoicing (PINT-AE / Peppol ASP Adapter)
- **Scope:**
  - OASIS UBL 2.1 XML generator compliant with UAE PINT-AE specifications (`packages/ubl-pinta-generator`).
  - Pluggable ASP Adapter interface with full sandbox mock and MLS (Message Level Response) handling.
  - Transmission retry workflows in Temporal, error handling, credit note linking, and 10-year immutable S3 storage.
- **Acceptance Criteria:**
  - Generated UBL XML passes strict Schematron and syntax validation for UAE PINT-AE.
  - ASP adapter handles positive ACK (cleared/accepted) and rejection flows gracefully.
  - Archived XML matches cryptographic hash in transmission log.

---

### Milestone 10: Multi-Entity Consolidation, Multi-Book & Corporate Tax
- **Scope:**
  - Multi-entity hierarchy, intercompany transactions with automated elimination journal entries.
  - Parallel books: IFRS Statutory Book vs. UAE Tax Book vs. Management Book.
  - Corporate Tax (9%) engine: AED 375,000 threshold, non-deductible expense adjustments (50% entertainment), Small Business Relief (SBR), Qualifying Free Zone Person (QFZP) de-minimis ratio engine ($$\le 5\%$$ / AED 5M), and tax loss carry-forward tracking.
- **Acceptance Criteria:**
  - Consolidated Balance Sheet & P&L correctly eliminate 100% of intercompany receivables/payables.
  - QFZP engine correctly flags disqualifying revenue breach and calculates 9% tax liability.
  - Corporate Tax computation report generates full supporting schedules with tax advisor flags.

---

### Milestone 11: IFRS 15 Revenue Recognition & Contract AI
- **Scope:**
  - Five-step IFRS 15 model: Contract identification, performance obligations, Standalone Selling Price (SSP) allocation, revenue schedules (point-in-time and over-time).
  - Contract asset and liability waterfall visualization.
  - AI Contract Analyzer extracting payment milestones, obligations, and penalties from customer contracts.
- **Acceptance Criteria:**
  - Multi-element contract SSP allocation mathematically verified against IFRS 15 examples.
  - Waterfall schedule accurately balances deferred revenue and contract liabilities across periods.

---

### Milestone 12: UAE Payroll, WPS & Advanced Asset/Lease Accounting (IFRS 16)
- **Scope:**
  - UAE Wages Protection System (WPS) SIF file generator.
  - End of Service Gratuity (EOSG) calculator under UAE Labour Law (Federal Decree-Law No. 33 of 2021).
  - IFRS 16 Right-of-Use (ROU) asset and lease liability amortization schedules.
- **Acceptance Criteria:**
  - WPS SIF file formats pass standard UAE Central Bank validation rules.
  - EOSG calculation correctly applies basic salary tiers for < 1 year, 1-5 years, and > 5 years tenure.

---

### Milestone 13: Model Context Protocol (MCP) Server, Public API & Firm Workspace
- **Scope:**
  - Dedicated MCP Server (`packages/mcp-server`) exposing read-only tools (`get_account_balance`, `query_journal_entries`, `get_vat_summary`) and approval-gated proposal tools.
  - REST API with OpenAPI documentation, webhook dispatching, and idempotency key handling.
  - Accounting Firm Multi-Client Workspace: client switcher, cross-client task queue, review portals.
- **Acceptance Criteria:**
  - External LLM client (Claude/Cursor) connects via MCP to query books successfully.
  - MCP rejects write attempts without authorized approval tokens.
  - Firm manager can switch between client entities with strict data isolation.

---

### Milestone 14: Production Hardening, Load Testing & Launch Readiness
- **Scope:**
  - Comprehensive end-to-end integration tests and Playwright UI tests.
  - High-concurrency load testing (k6) verifying ledger write throughput and query latency.
  - Disaster recovery runbook, automated backup scripts with point-in-time recovery (PITR).
  - Realistic UAE demo dataset seed script (multi-entity group with mainland and DMCC entities, realistic transactions).
- **Acceptance Criteria:**
  - Test suite passes with $$\ge 85\%$$ coverage on ledger and tax modules.
  - Zero critical vulnerabilities in static analysis and dependency audits.
  - Seed script successfully bootstraps a live demo company in both Arabic and English.
