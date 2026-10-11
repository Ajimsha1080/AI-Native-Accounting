# LedgerAE: Phased Release Plan & Milestone Roadmap

**Target Initial Customer:** UAE Corporate Group (3-10 entities, 20-200 staff, multi-currency, VAT registered, external auditor).

---

## Release Waves

```
   ┌────────────────────────────────────────────────────────┐
   │ R1: Accounting Core + VAT (Milestones 1 - 5)          │
   │ "Sellable to Pilot Customer"                           │
   └──────────────────────────┬─────────────────────────────┘
                              │
   ┌──────────────────────────▼─────────────────────────────┐
   │ R2: AI + E-Invoicing (Milestones 6 - 8)                │
   │ "Autonomous Close & Peppol E-Invoicing"                │
   └──────────────────────────┬─────────────────────────────┘
                              │
   ┌──────────────────────────▼─────────────────────────────┐
   │ R3: Group Finance (Milestones 9 - 10)                  │
   │ "Multi-Entity Consolidation & Corporate Tax 9%"        │
   └──────────────────────────┬─────────────────────────────┘
                              │
   ┌──────────────────────────▼─────────────────────────────┐
   │ R4: Platform & Scale (Milestones 11 - 13)              │
   │ "IFRS 15/16, WPS, Firm Workspace, MCP & Connectors"    │
   └────────────────────────────────────────────────────────┘
```

---

## Detailed Milestone Definitions & Definition of Done (DoD)

### Phase R1: Accounting Core + UAE VAT (Pilot Sellable)

#### Milestone 1: Foundation (Auth, Tenancy, RBAC, Audit, Design System, RTL)
- **Scope:** Workspace monorepo, PostgreSQL RLS schema, RBAC engine with Segregation of Duties, immutable audit logger, bilingual design tokens (ar/en) with RTL.
- **Definition of Done (DoD):**
  1. Automated cross-tenant isolation test suite passes with 0 leaked records.
  2. Every database mutation produces a cryptographically diff-hashed audit log entry.
  3. Next.js Arabic RTL layout and bilingual dictionary verified with bidirectional table alignment.
  4. CI pipeline clean on lint, typecheck, and unit tests.

#### Milestone 2: Ledger Core (Multi-Currency, FX Revaluation, Period Lock)
- **Scope:** Append-only double-entry ledger, BigInt minor units, Banker's Rounding, 10,000 property-based invariant tests, period hard/soft lock.
- **Definition of Done (DoD):**
  1. Invariant property test suite verifies $\sum \text{Debits} = \sum \text{Credits}$ across 10,000 randomized permutations.
  2. Attempting to post to a hard-locked accounting period throws `PeriodLockedException`.
  3. Trial balance calculation for 1M lines meets the $< 3\text{ s}$ performance target.

#### Milestone 3: AR/AP Subledgers & Approval Workflows
- **Scope:** Customers, Invoices, Vendors with 15-digit TRN format checks, Bills, 3-way matching ($\text{PO} \leftrightarrow \text{GRN} \leftrightarrow \text{Bill}$), tiered approval workflows ($\le 10\text{k}$, $\le 50\text{k}$, $> 50\text{k}$ AED).
- **Definition of Done (DoD):**
  1. End-to-end procure-to-pay and order-to-cash subledger postings pass automated tests.
  2. 3-way match blocks payment approval on quantity or price discrepancies beyond threshold.
  3. Segregation of duties prevents self-approval of bills.

#### Milestone 4: UAE VAT & Excise Tax Suite
- **Scope:** Versioned tax rules module with Federal Decree-Law No. 8 of 2017 citations, standard 5%, zero-rate, exempt, reverse charge (Art. 48), designated free zones, input tax partial exemption, and VAT 201 return data with drill-down.
- **Definition of Done (DoD):**
  1. Box-by-box calculation of VAT 201 return matches FTA calculation rules with zero discrepancy.
  2. Every figure in VAT 201 drills down directly to underlying journal entries.
  3. All interpretive rules carry statutory citations and `"VERIFY WITH UAE TAX ADVISOR"` flags.

#### Milestone 5: Banking & Reconciliation Engine
- **Scope:** UAE bank statement parser (ENBD, FAB, ADCB CSV/MT940), automated rule-based reconciliation (1:1, 1:N, N:M), cross-currency settlement with auto-realized FX gain/loss down to the fil.
- **Definition of Done (DoD):**
  1. Reconciliation accuracy verified on labelled UAE statement datasets.
  2. Cross-currency settlements compute exact realized FX without float errors.
  3. **R1 Pilot-Ready Checklist Signed Off** for pilot customer onboarding.

---

### Phase R2: AI Layer & UAE E-Invoicing

#### Milestone 6: AI Assistant & Document Intelligence (OCR)
- **Scope:** Multimodal/OCR extraction of bilingual Arabic/English invoices into draft bills with line-level VAT coding; accounting copilot executing deterministic SQL queries (logic first, LLM second).
- **Definition of Done (DoD):**
  1. OCR accuracy meets $\ge 95\%$ extraction benchmark on UAE invoice test set.
  2. Zero ledger numbers fabricated by LLM; copilot returns exact SQL queries and links to vouchers.
  3. Token usage and costs logged per tenant.

#### Milestone 7: Autonomous Agents Runtime & Continuous AI Monitors
- **Scope:** Temporal workflow engine for background agents; continuous monitors for duplicate bills, missing vendor TRNs, and pegged FX outliers; human-in-the-loop proposals queue with configurable auto-approve thresholds.
- **Definition of Done (DoD):**
  1. Continuous monitors flag synthetic duplicate bills and missing TRNs with actionable tasks.
  2. AI agents output proposals only; direct postings are rejected without policy/human sign-off.
  3. Workflows survive worker restarts and maintain visible audit history.

#### Milestone 8: UAE E-Invoicing (Peppol PINT-AE & ASP Adapter)
- **Scope:** OASIS UBL 2.1 XML generator compliant with UAE PINT-AE specifications; pluggable ASP adapter interface with sandbox mock and real provider integration.
- **Definition of Done (DoD):**
  1. Generated UBL XML passes Schematron and syntax validation for UAE PINT-AE.
  2. Sandbox ASP adapter processes transmission, clears invoices, and handles MLS rejection flows.
  3. Immutable 10-year archival simulation verified.

---

### Phase R3: Group Finance

#### Milestone 9: Multi-Entity Consolidation, Multi-Book & Close Management
- **Scope:** Parent-subsidiary hierarchies, automated intercompany elimination journals (IFRS 10), multi-book accounting (Statutory IFRS vs. Management), close checklist DAG engine, dynamic financial statement builder.
- **Definition of Done (DoD):**
  1. Consolidated balance sheet and P&L eliminate 100% of intercompany balances across 10 seeded entities in $< 10\text{ s}$.
  2. Close checklist dependencies strictly block period close until prerequisites pass.

#### Milestone 10: Corporate Tax (9%) & Group Budgeting
- **Scope:** Federal Decree-Law No. 47 of 2022 calculation engine, AED 375,000 threshold, 50% entertainment disallowance, 75% loss carry-forward relief cap, and Qualifying Free Zone Person (QFZP) de-minimis ratio engine ($\le 5\%$ or AED 5M).
- **Definition of Done (DoD):**
  1. Corporate tax computation verified against statutory scenarios with tax advisor flags.
  2. Return-ready corporate tax export generated.

---

### Phase R4: Platform & Scale (Only after R1-R3 have paying customers)

#### Milestone 11: Advanced Accounting (IFRS 15 Rev-Rec, Fixed Assets, Leases, Payroll/WPS)
- **Scope:** IFRS 15 5-step model with relative SSP allocation and deferred revenue waterfalls; IAS 16 straight-line depreciation; IFRS 16 lease schedules; UAE Labour Law EOSG and Central Bank WPS SIF file generator.
- **Definition of Done (DoD):**
  1. SSP allocation and waterfall schedules balance to the fil.
  2. WPS SIF files format-validated against Central Bank specifications.

#### Milestone 12: Public API, MCP Server, Accounting-Firm Workspace & Platform Connectors
- **Scope:** OpenAPI REST API, Model Context Protocol (MCP) server for external AI tools (read-scoped by default, write via CFO tokens), CPA firm multi-client portal, migration importers.
- **Definition of Done (DoD):**
  1. External LLM clients query books securely via MCP.
  2. Accounting firm dashboard manages multi-client statuses with tenant isolation.

#### Milestone 13: Hardening, External Security Review, DR Drill & General Availability
- **Scope:** Third-party penetration testing, disaster recovery restore drill, 2x load testing (20M lines), and launch checklist sign-off.
- **Definition of Done (DoD):**
  1. Zero high/critical vulnerabilities.
  2. Point-in-time recovery completed within RTO/RPO targets.
  3. General Availability (GA) certification.
