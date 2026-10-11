# LedgerAE: Non-Functional Requirements (NFR) Test & Verification Plan

**Target Customer Profile:** UAE Corporate Group (3-10 entities, 20-200 staff, multi-currency, VAT-registered, external audit).  
**Baseline Standard:** OWASP ASVS Level 2, UAE PDPL, SOC 2 Type II readiness.

---

## 1. Scale & Performance Targets (Tunable Benchmark Analysis)

| Metric | Target Specification (p95) | Rationale & Architectural Design | Test Harness & Verification Tool |
| :--- | :--- | :--- | :--- |
| **Tenant Scale** | 50 entities, 10M ledger lines/yr, 500 concurrent users | Meets multi-entity holding group needs (mainland, free zones, SPVs). | Synthetic multi-tenant database seeder (`seed-demo.ts`). |
| **List Views Latency** | $< 500\text{ ms}$ | Virtualized TanStack Table + cursor-based keyset pagination on indexed Postgres columns. | k6 HTTP load scripts on `/api/v1/ledger/entries` with 100 concurrent virtual users. |
| **Trial Balance Latency** | $< 3\text{ s}$ for 1,000,000 journal lines | Pre-aggregated period balance snapshots (`account_period_balances`) updated synchronously on voucher commit. | Dedicated benchmark test aggregating 1M lines over partitioned Postgres tables. |
| **Consolidated Group Report** | $< 10\text{ s}$ across 10 entities | Parallelized entity balance queries in Node.js worker pool + in-memory intercompany elimination engine. | Multi-entity consolidation benchmark across 10 entities with reciprocal transactions. |
| **Document-to-Draft Bill (OCR)** | $< 30\text{ s}$ | Asynchronous document pipeline processing via Temporal workers; multimodal vision tool extraction. | End-to-end PDF upload to structured JSON bill benchmark on bilingual test invoices. |

---

## 2. High Availability, Reliability & Disaster Recovery

- **Availability Target:** $99.9\%$ uptime ($\le 43.8$ minutes downtime/month).
- **Recovery Point Objective (RPO):** $5\text{ minutes}$ via continuous WAL streaming replication to UAE S3.
- **Recovery Time Objective (RTO):** $1\text{ hour}$ via automated container orchestration in UAE region.
- **Verification Plan:**
  - Automated quarterly backup restoration drills running in a staging environment.
  - Chaos engineering simulations testing Redis restart, database failover, and Temporal worker recovery without data loss.

---

## 3. Security, Tenancy & Audit Test Plan (OWASP ASVS L2)

- **Tenant Isolation Verification:**
  - Automated test suite executes queries with valid entity and journal IDs while switching RLS tenant context.
  - Zero records must leak across tenants ($100\%$ isolation guarantee).
- **Ledger Immutability Verification:**
  - Database-level triggers intercept and block all `UPDATE` and `DELETE` queries on posted journal entries and lines.
  - Merkle SHA-256 hash chaining verifies the audit integrity of the entire voucher sequence.
- **Segregation of Duties (SoD) Testing:**
  - Automated tests verify that bill/voucher creators cannot approve their own submissions.
- **Penetration Testing:**
  - Scheduled third-party external penetration test prior to General Availability (GA).

---

## 4. Accessibility, Internationalization & Browser Compatibility

- **WCAG 2.1 Level AA:** Verified using automated Axe-core and Lighthouse accessibility CI checks.
- **RTL & Bilingual UI:** Next.js App Router with native Arabic RTL support; bidirectional numeric alignments (AED amounts right-aligned in LTR, left-aligned in RTL).
- **Supported Browsers:** Current versions of Google Chrome, Microsoft Edge, Apple Safari, and Mozilla Firefox.

---

## 5. UAE Data Residency, Governance & Cost Monitoring

- **Data Residency:** All databases, Redis clusters, Temporal instances, and S3 archives pinned to UAE data centers (AWS `me-central-1` UAE or Azure UAE Central).
- **Configurable Retention:** Default 5+ years for VAT audit records; 10 years for e-invoicing UBL XML files; legal hold locks prevent premature purging.
- **AI Cost Metering:** Every LLM prompt and completion records token counts and cost per tenant in `audit_logs` with automated budget alerts.
