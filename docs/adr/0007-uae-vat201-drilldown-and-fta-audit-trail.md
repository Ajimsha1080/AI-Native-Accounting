# ADR 0007: UAE VAT 201 Return Architecture, Emirate Breakdown, and Point-in-Time Drill-Down Engine

## Status
Accepted

## Context
Under UAE Federal Decree-Law No. 8 of 2017 on Value Added Tax and its Executive Regulations, taxable businesses must submit periodic VAT returns (Form VAT 201) to the Federal Tax Authority (FTA).
Key statutory requirements dictate:
1. **Emirate-Level Apportionment**: Standard rated supplies (Box 1) must be categorized across the 7 Emirates (1a Abu Dhabi, 1b Dubai, 1c Sharjah, 1d Ajman, 1e Umm Al Quwain, 1f Ras Al Khaimah, 1g Fujairah) based on the place of supply rules (fixed establishment or physical location where services/goods are delivered).
2. **Reverse Charge Mechanism (RCM)**: Cross-border imports of services (Article 48) must report output tax in Box 3 and recoverable input tax in Box 10, achieving a net zero tax effect for fully taxable entities.
3. **Statutory Blocked Input VAT**: Article 53 strictly disallows input VAT recovery on client entertainment and motor vehicles available for personal use.
4. **Audit Trail Invariance**: During an FTA tax audit, taxpayers are mandated to provide an official FTA Tax Audit File (FAF) and prove that every single fils aggregated into Box 1 through 14 links directly to a source tax invoice, credit note, customs declaration, or journal voucher.

## Decision
1. **Granular Box Data Model**:
   - Implemented an immutable, versioned VAT 201 calculation engine (`packages/uae-tax-engine/src/vat201.ts`).
   - Defined all 14 official FTA boxes including sub-boxes `1a` through `1g`.
   - Every box summary encapsulates an array of `VatDrillDownRecord` entries detailing voucher ID, invoice number, date, counterparty TRN, tax code, net amount, VAT amount, adjustments, and explicit legal article citations.
2. **Mathematical Invariant Rule**:
   - Invariant: For every box $b \in [1..13]$, $\sum \text{drillDown.net} == b.\text{amountBase}$, $\sum \text{drillDown.vat} == b.\text{vatAmountBase}$, and $\sum \text{drillDown.adj} == b.\text{adjustmentAmountBase}$.
   - Float math is banned; all calculations execute in integer minor units (`fils`) with `BigInt`.
3. **FTA Audit File (FAF) Generation**:
   - Built-in FAF generator producing the standard format demanded by FTA inspectors, linking Sales Ledger and Purchase Ledger to VAT 201 box totals.
4. **Regulatory Attribution & Advisor Safeguard**:
   - In accordance with ADR 0003, any transaction with ambiguous tax treatment (e.g., partial exemption overheads, Article 53 client entertainment, designated zone goods movements) automatically flags `advisorVerificationRequired: true`.

## Consequences
- Guarantees immediate audit readiness for external UAE tax auditors and FTA inspections.
- Ensures zero reconciliation drift between the general ledger vouchers and the submitted VAT 201 figures.
- Provides accounting teams with 1-click drill-down from any tax box directly to the source invoice.
