# ADR 0014: IFRS 15 Revenue Recognition, IFRS 16 Leases, IAS 16 Fixed Assets, and UAE WPS Payroll Architecture

## Status
Accepted

## Context
Mid-market UAE enterprises and holding groups require full compliance with international financial reporting standards (**IFRS 15, IFRS 16, IAS 16**) alongside local statutory employment regulations:
1. **IFRS 15 (Revenue from Contracts with Customers)**:
   - Requires a 5-step model to allocate transaction price based on relative Standalone Selling Prices (SSP).
   - Multi-element software contracts typically bundle point-in-time perpetual/setup licenses with over-time SLA/cloud maintenance.
   - Requires Contract AI metadata to cite underlying contract clauses (e.g. SLA terms, delivery milestones) justifying the accounting treatment.
   - **Reconciliation Invariant**: At every close period, $\text{Cumulative Recognized Revenue} + \text{Remaining Deferred Revenue} = \text{Total Transaction Price}$ to 0 fils.
2. **IFRS 16 (Leases)**:
   - Mandates single on-balance sheet lessee accounting for property, warehouse, and equipment leases.
   - Initial measurement recognizes a Right-of-Use (ROU) Asset and Lease Liability discounted at the Incremental Borrowing Rate (IBR).
   - Subsequent measurement depreciates ROU straight-line and amortizes lease liability via the effective interest method.
   - Segregates current (due within 12 months) vs non-current lease liabilities.
   - **Zero-Out Invariant**: At lease termination, both the Lease Liability and ROU Net Book Value must reach exactly $0\text{ fils}$.
3. **IAS 16 (Property, Plant, and Equipment)**:
   - Straight-line and declining depreciation capped at salvage value.
   - Asset derecognition / disposal generating balanced journal entries removing historical cost and accumulated depreciation, recognizing bank proceeds and net Gain/Loss on Disposal.
4. **UAE Wages Protection System (WPS) & Labour Law No. 33 of 2021**:
   - UAE Central Bank and MOHRE mandate electronic salary transfer via standard Salary Information Files (SIF).
   - Format requires a Salary Control Record (SCR) header and Employee Detail Record (EDR) lines.
   - Strict validation: 13-digit MOL employer ID, 3-digit bank routing code, 23-character UAE IBAN (`AE...`), and exact header-to-detail salary and employee count reconciliation.
   - Article 51 End of Service Gratuity (EOSG): 21 days basic salary/year for years 1–5, 30 days/year for subsequent years, pro-rata for remainder days, capped at 2 years' basic salary.

## Decision
1. **IFRS 15 Revenue Engine (`Ifrs15RevenueEngine`)**:
   - Implemented in `@ledger-ae/ledger-core` with exact `BigInt` fils SSP relative allocation and Banker's Rounding (`roundHalfEven`).
   - Generates 12-month deferred revenue waterfall schedules and automated journal entries ($\text{Dr Deferred Revenue}, \text{Cr Revenue}$).
   - `verifyScheduleReconciliation`: Programmatically enforces contract price balance invariants across all periods.
   - Preserves Contract AI cited clauses (`citedClauseSection`, `citedClauseText`) for external auditor verification.
2. **IFRS 16 Lease Engine (`Ifrs16LeaseEngine`)**:
   - Discounted cash flow present value calculation for initial lease liabilities.
   - Amortization schedule engine splitting interest expense, principal repayment, ROU straight-line depreciation, and current/non-current liability portions.
   - Generates balanced initial recognition and monthly recurring journal vouchers ($\text{Debits} == \text{Credits}$ to $0\text{ fils}$).
3. **IAS 16 Asset Disposal Engine (`calculateAssetDisposal`)**:
   - Computes net book value and proceeds differential.
   - Emits balanced 4-way/3-way disposal journal entries ($\text{Dr Bank}, \text{Dr Accum Dep}, \text{Cr Asset Cost}, \text{Cr Gain / Dr Loss}$).
4. **UAE WPS & Central Bank SIF Validator (`validateWpsSifContent`)**:
   - Implemented in `@ledger-ae/uae-tax-engine`.
   - Validates SCR and EDR syntax, regex constraints, IBAN format, and cross-reconciles totals before submission to UAE clearing banks (ENBD, FAB, ADCB).

## Consequences
- Guarantees external audit sign-off on revenue recognition schedules and lease accounting disclosures.
- Prevents WPS clearing rejections and Central Bank fines for UAE corporate payroll runs.
- Eliminates manual spreadsheet errors in fixed asset registers and disposal gains/losses.
