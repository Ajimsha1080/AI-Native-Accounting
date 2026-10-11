# LedgerAE: Product Requirements Document (PRD)

**Version:** 1.0.0-PROD  
**Target Market:** UAE Mid-Market Companies, Multi-Entity Conglomerates, Accounting & Audit Firms  
**Jurisdictions Supported:** UAE Mainland, Free Zones (DAFZA, DMCC, JAFZA, etc.), Financial Free Zones (DIFC, ADGM)  
**Currencies:** AED (Base Default), USD (Pegged 3.6725), EUR, GBP, SAR, INR, and all ISO-4217 currencies  

---

## 1. Executive Summary & Vision
LedgerAE is a next-generation, AI-native Enterprise Resource Planning (ERP) platform purpose-built for UAE mid-market enterprises and professional accounting firms. It merges the financial rigor of an append-only, perpetual double-entry ledger with autonomous continuous-close workflows, deep UAE tax localization (VAT 201, Corporate Tax 9%, Qualifying Free Zone Person logic, Peppol PINT-AE E-Invoicing), and an intelligent agent runtime.

Unlike legacy ERPs adapted for the Gulf, LedgerAE guarantees:
- **Mathematical Integrity:** Integer minor-unit BigInt math, no floats, deterministic bankers' rounding, hard double-entry invariants ($$\sum \text{Debits} = \sum \text{Credits}$$).
- **Audit-First AI:** Deterministic queries first, LLM natural language reasoning second. AI never hallucinates numbers; it proposes drafts with audit links.
- **Continuous Close:** Real-time anomaly detection, continuous reconciliation, automated accruals, and close checklists.
- **Native UAE Compliance:** Bilingual (Arabic/English) RTL-native UI, FTA-compliant reporting, versioned rules engine with statutory citations and "VERIFY WITH TAX ADVISOR" safeguards.

---

## 2. Target Personas & Use Cases

### Personas
1. **Financial Controller / CFO (Mid-Market UAE Corp):** Needs instant consolidated multi-entity visibility, cash flow forecasting, period close velocity (< 2 days), and zero-penalty FTA compliance.
2. **Senior Accountant / Bookkeeper:** Handles day-to-day AP/AR, 3-way matching, bank reconciliations across Emirates NBD, ADCB, Mashreq, and VAT return generation.
3. **Partner / Manager at Accounting Firm:** Manages multi-client workspaces, assigns junior accountants, oversees client sign-offs, and audits reconciliations.
4. **Internal / External Auditor:** Demands immutable audit trails, point-in-time journal drill-downs, and evidence packs with zero friction.
5. **Tax Agent / FTA Advisor:** Reviews VAT 201 and Corporate Tax returns, qualifying income determinations for Free Zone entities.

---

## 3. Product Scope & Functional Modules

### Module 1: Perpetual Ledger & Multi-Book Engine
- **Double-Entry Append-Only Core:** Journal entries once posted are immutable. Corrections require linked reversing/adjusting entries.
- **Multi-Entity & Consolidation:** Support for parent-subsidiary trees, currency translation (IAS 21), automated intercompany eliminations, and non-controlling interest accounting.
- **Multi-Book Accounting:**
  - *Statutory IFRS Book:* Full IFRS compliance for regulatory audits.
  - *UAE Tax Book:* Reflects tax adjustments (e.g. non-deductible entertainment expenses, tax depreciation, QFZP qualifying activities).
  - *Management Book:* Internal transfer pricing and operational allocations.
- **FX Revaluation:** Deterministic unrealized/realized gain/loss postings based on central bank rates.
- **Dimensions:** Up to 8 configurable dimensions per posting line (Entity, Cost Center/Department, Project, Location/Emirate, Class, Product Line).

### Module 2: Order-to-Cash (AR) & IFRS 15 Revenue Recognition
- **Contract-Based Rev-Rec (IFRS 15):** Performance obligations identification, Standalone Selling Price (SSP) allocation, over-time (input/output methods) vs. point-in-time recognition, contract asset/liability waterfall schedules.
- **AI Contract Analyzer:** Extracts payment terms, delivery milestones, and renewal clauses from customer contracts (PDF/Docx), proposing Rev-Rec treatment with page/clause citations.
- **Billing & Collections:** E-invoices, credit/debit notes, recurring subscriptions, payment links (Stripe, UAE local payment gateways), automated dunning workflows, customer statements.

### Module 3: Procure-to-Pay (AP) & Expense Management
- **Vendor Lifecycle:** UAE TRN validation via FTA portal integration/format check, designated zone status checks, bank account validation (IBAN checksum).
- **Three-Way Matching:** Purchase Order (PO) $$\leftrightarrow$$ Goods Receipt Note (GRN) $$\leftrightarrow$$ Vendor Bill. Configurable variance tolerances ($$\le 1\%$$ or $$\le \text{AED } 50$$).
- **Document Intelligence (OCR):** Dual-language Arabic/English OCR for receipts and bills, extracting line items, TRN, invoice numbers, and auto-classifying expense accounts and VAT rates.
- **Payment Runs:** Bulk payment file generation for UAE banks (FAB, ENBD, ADCB, Mashreq WPS and corporate batch formats).

### Module 4: Banking & Reconciliation
- **Data Ingestion:** Pluggable UAE Open-Finance connectors (e.g., Lean, Tarabut Gateway, Dapi) + standard file imports (MT940, CAMT.053, CSV).
- **Reconciliation Engine:**
  - Rule-based auto-matching (1:1, 1:N, N:1, N:M).
  - Cross-currency reconciliation with automatic realized FX computation.
  - Machine learning suggestions with explainability confidence scores ($$0-100\%$$).

### Module 5: UAE Compliance & Tax Suite
- **Value Added Tax (VAT 201):**
  - Rates: 5% Standard, 0% Export/Qualifying, Exempt (financial/residential), Out of Scope.
  - Reverse Charge Mechanism (RCM) on imported services and goods (Box 3 and Box 10).
  - Designated Free Zones logic (customs controls, intra-zone goods vs. mainland consumption).
  - Input tax apportionment & partial exemption calculations.
  - Automated drill-down from VAT 201 Return boxes directly to underlying journal entries.
- **Corporate Tax (Federal Decree-Law No. 47 of 2022):**
  - Standard 9% rate on taxable income above AED 375,000; 0% up to AED 375,000.
  - Small Business Relief (SBR) election support for revenue under AED 3,000,000.
  - Qualifying Free Zone Person (QFZP) test engine: de-minimis rule ($$\le 5\%$$ of total revenue or AED 5,000,000), qualifying activities vs. excluded activities.
  - Non-deductible adjustments (50% entertainment, fines, exempt dividends).
  - Tax loss carry-forward tracking (capped at 75% of taxable income).
- **E-Invoicing (UAE Peppol / PINT-AE):**
  - OASIS UBL 2.1 PINT-AE compliant XML generation and cryptographic validation.
  - Pluggable ASP (Accredited Service Provider) adapter with sandboxed mock and MLS status tracking.
  - Mandatory 10-year immutable audit archiving.
- **WPS & Payroll:** Wages Protection System SIF file generation, End of Service Gratuity (EOSG) accruals under UAE Labour Law (Federal Decree-Law No. 33 of 2021).

### Module 6: AI-Native Layer & Agent Runtime
- **Accounting Copilot:** Natural language Q&A over financial data. Accounting logic is executed strictly via deterministic parameterized SQL/engine calls. Zero LLM numerical fabrication.
- **Autonomous Agent Runtime:** Executes long-running agents via Temporal (e.g., Month-End Accruals Agent, Continuous Audit Anomaly Agent, Rev-Rec Sync Agent).
- **Human-in-the-Loop Guardrails:** Every AI action creates a proposal. Auto-approval only under configurable low-risk rules. Full prompt/response/cost logging.
- **Model Context Protocol (MCP) Server:** Exposes read-only financial books and approved tools to developer environments and authorized AI agents.

### Module 7: Reporting & Continuous Close
- **Close Checklist Engine:** Tasks, milestones, dependencies, role assignments, automated task closing when automated reconciliation checks pass.
- **Period Locking:** Soft locks (warning) and hard locks (supervisor cryptographic unlock required).
- **Financial Statement Builder:** Dynamic Balance Sheet, P&L, Cash Flow (Direct/Indirect), Trial Balance, General Ledger, Partner Capital Accounts with drill-down to source vouchers.

---

## 4. Non-Functional Requirements (NFR)
1. **Data Residency & Privacy:** Cloud infrastructure hosted in UAE (AWS `me-central-1` UAE or Azure UAE Central/North) complying with UAE Federal Decree-Law No. 45 of 2021 (PDPL).
2. **Security & RBAC:** Multi-tenant PostgreSQL Row-Level Security (RLS), Segregation of Duties (SoD), AES-256 field-level encryption for sensitive tax/banking identifiers, TLS 1.3, Mandatory MFA.
3. **Performance & Scalability:**
   - Single journal entry write latency: $$< 25\text{ms}$$.
   - General Ledger report generation (1M lines): $$< 1.5\text{s}$$.
   - TanStack Table client-side virtualized rendering: 60 FPS up to 100,000 rows.
4. **Availability & Resilience:** 99.95% uptime SLA, RPO $$= 0$$ (synchronous DB replication), RTO $$< 15\text{min}$$.

---

## 5. Scope Boundaries & Out of Scope for Phase 1
- **Out of Scope:** Direct FTA API filing without human review (FTA does not provide an open public filing API; data is exported for portal upload).
- **Out of Scope:** Direct self-accreditation as a Peppol ASP (LedgerAE uses the ASP Adapter pattern to partner with licensed providers).
- **Deferred to Later Milestones:** Tourist tax refund kiosk integration, complex maritime customs logistics.
