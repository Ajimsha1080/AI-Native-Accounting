# ADR 0003: Versioned, Data-Driven UAE Tax & Compliance Rules Architecture

## Status
Accepted

## Context
UAE tax regulations (Federal Decree-Law No. 8 of 2017 on Value Added Tax, Federal Decree-Law No. 47 of 2022 on Corporate Tax, FTA Executive Regulations, and upcoming UAE Peppol PINT-AE e-invoicing mandates) evolve across distinct timelines, ministerial decisions, and administrative guidelines.
Hardcoding tax logic into application business flows leads to regulatory drift, code brittleness, and audit risk. Furthermore, accounting software must explicitly distinguish between verified statutory rules and interpretations pending tax counsel validation.

## Decision
1. **Versioned Rules Engine (`packages/uae-tax-engine`)**:
   - All tax rates (VAT standard 5%, zero-rate qualifying exports, exempt financial services, reverse charge mechanism, excise tax rates 50%/100%), Corporate Tax thresholds (AED 375,000 exempt threshold, 9% standard rate, Qualifying Free Zone Person 0% qualifying income vs. 9% non-qualifying income), and e-invoicing phases are externalized into declarative, versioned JSON/TypeScript schemas.
   - Every rule is annotated with:
     - `ruleId`: Unique canonical identifier.
     - `lawReference`: FTA law/decree and article citation (e.g. `Federal Decree-Law No. 8 of 2017, Art. 48`).
     - `effectiveFrom`: ISO Date.
     - `effectiveTo`: ISO Date | null.
     - `verifyWithTaxAdvisor`: Boolean flag. Rules subject to case-by-case regulatory interpretation (e.g. QFZP de-minimis limits, designated zone intra-warehouse transfers, tourist refund conditions) carry `verifyWithTaxAdvisor: true`.
     - `auditNote`: Human-readable accounting guidance.

2. **Peppol PINT-AE & ASP Architecture**:
   - LedgerAE generates standard OASIS UBL 2.1 XML complying with the UAE PINT-AE specification.
   - Communication with the UAE FTA e-invoicing network is executed via an Accredited Service Provider (ASP) Adapter interface. LedgerAE does not self-accredit as an ASP; it integrates via pluggable ASP connectors with sandbox mocks, MLS message level responses, and durable Temporal retry workflows.

## Consequences
- Enables retroactive tax audits using the exact tax rules active at the transaction date.
- Protects users and CPAs with transparent regulatory source attribution and tax advisor verification prompts.
