# ADR 0008: Bank Connectivity, Statement Parsers, and Intelligent Reconciliation Engine

## Status
Accepted

## Context
Mid-market UAE groups typically hold commercial accounts across multiple local banks (Emirates NBD, First Abu Dhabi Bank, Abu Dhabi Commercial Bank, Mashreq, Dubai Islamic Bank).
Bank reconciliation presents major operational pain points:
1. **Diverse Statement Formats**: Lack of unified export standard; companies export CSVs, SWIFT MT940 text statements, and modern ISO 20022 CAMT.053 XML files.
2. **Open Finance Regulation**: Under the UAE Central Bank Open Finance framework, direct screen scraping of banking portals is prohibited; connectivity must flow through licensed Open Finance aggregators (such as Lean Technologies or Tarabut Gateway).
3. **Complex Matching Patterns**: Real-world operations feature 1:1 invoice payments, 1:Many lump-sum customer wire settlements, Many:1 batch vendor payouts, and cross-currency receipts (e.g., USD invoiced, settled in AED with realized FX movements).
4. **Automated Recurring Charges**: Recurring debits (wire fees, POS merchant fees, loan facility charges) carry 5% UAE VAT and should be auto-posted into the general ledger without manual data entry.

## Decision
1. **Pluggable Open Finance Aggregator Interface (`BankFeedAggregatorAdapter`)**:
   - In accordance with ADR 0005 (Buy vs Build), LedgerAE implements a standardized interface for Central Bank-accredited aggregators (Lean Technologies and Tarabut Gateway).
   - In sandbox/development, `LeanSandboxAggregatorAdapter` provides typed account syncing and HMAC webhook verification.
2. **Multi-Format Parsing Engine (`BankStatementParser`)**:
   - Zero-dependency, pure TypeScript parsers for:
     - UAE Corporate CSV format (ENBD, FAB, ADCB, Mashreq).
     - SWIFT MT940 format (processing `:20:`, `:25:`, `:28C:`, `:60F:`, `:61:` value/entry dates and amounts, and `:86:` narratives).
     - ISO 20022 CAMT.053 XML format.
3. **Multi-Pass Reconciliation Engine (`ReconciliationEngine`)**:
   - **Pass 1 (Rules Engine)**: Evaluates regex and criteria rules to auto-generate proposed journal entries for bank charges and interest with automatic 5% VAT extraction.
   - **Pass 2 (1:1 Exact & Date-Drift Match)**: Matches transactions on amount, direction, reference, and posting date with confidence scoring (100% Exact, 85% High).
   - **Pass 3 (Cross-Currency Match)**: Computes realized FX gain/loss down to the exact fil using Banker's Rounding and historical transaction rates.
   - **Pass 4 (1:Many Subset Matching)**: Uses bounded combination search to match lump-sum bank deposits against multiple open customer receivables.
   - **Pass 5 (Many:1 Batch Matching)**: Reconciles consolidated bank debits against multiple supplier/payroll disbursements.
4. **Safety & Zero False Positive Invariant**:
   - Direct automatic ledger posting is only permitted when match confidence is $\ge 95\%$ or governed by an explicit tenant rule.
   - Ambiguous matches ($< 85\%$) are flagged as proposals for human review.

## Consequences
- Enables automated daily reconciliation across all major UAE banks.
- Drastically reduces month-end closing hours for accounting staff.
- Guarantees zero false-positive automated journal postings.
