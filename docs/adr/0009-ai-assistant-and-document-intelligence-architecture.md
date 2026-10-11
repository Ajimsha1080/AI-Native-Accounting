# ADR 0009: AI Accounting Copilot, Document Intelligence, and Cost Governance Architecture

## Status
Accepted

## Context
Commercial mid-market ERPs cannot tolerate numerical hallucinations. When a CFO, Controller, or Auditor queries financial positions (revenue, cash balances, VAT liability), the response must reflect exact general ledger truth down to the fil.
Furthermore:
1. **Document Intelligence**: UAE vendor bills and expense receipts are bilingual (Arabic and English) with strict FTA requirements (15-digit TRN, Article 59 tax invoice lines, standard 5% VAT vs zero-rated vs reverse charge).
2. **Cost Governance & Data Residency**: AI API calls incur variable operational expenses. Under NFR requirements, LedgerAE must track token usage and USD costs per tenant and per action, alerting on monthly budget thresholds to prevent cost overruns.
3. **Audit Trail**: Every AI action must be permanently logged with prompt version, model identifier, and latency.

## Decision
1. **Deterministic Queries First, Language Model Second**:
   - The AI Assistant never generates numerical financial figures.
   - User inquiries are mapped to strongly typed database queries and aggregations executed in pure TypeScript/BigInt.
   - The returned natural language responses embed the deterministic calculation result, the exact parameterized SQL query executed, and clickable citations to individual journal vouchers.
2. **Bilingual Document Intelligence Engine (`DocumentIntelligenceService`)**:
   - Implemented a specialized extractor for UAE invoices supporting both Arabic and English text.
   - Validates 15-digit TRNs starting with `100` via `isValidUaeTrn`.
   - Classifies tax codes into statutory treatments (`SR_5`, `ZR_EXP_0`, `ZR_LOC_0`, `EX_FIN`, `RCM_5`).
   - Performs mathematical sanity checks ($\sum \text{Lines} == \text{Subtotal}$, $\text{Subtotal} + \text{VAT} == \text{Total}$).
3. **Immutable Action Logging & Tenant Budgeting (`AiActionLogger`)**:
   - Every AI action records an immutable `AiActionLog` containing `tenantId`, `userId`, `actionType`, `model`, `promptVersion`, input/output tokens, latency, and estimated USD cost.
   - Supports tenant budget limits with automated alerts at 80% threshold and hard warning flags upon budget exhaustion.

## Consequences
- Guaranteed zero numerical hallucinations for all financial queries.
- Complete auditability for external auditors and tax advisors.
- Granular visibility into AI gross margins and per-tenant unit economics.
