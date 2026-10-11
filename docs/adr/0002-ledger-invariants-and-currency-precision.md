# ADR 0002: Append-Only Double-Entry Ledger, Currency Precision, and Multi-Book Architecture

## Status
Accepted

## Context
Accounting systems must guarantee mathematical correctness, auditability, and immutability. Floating-point arithmetic introduces rounding drift, unacceptable in statutory accounting (such as UAE VAT 201 filing and FTA audit requirements). Furthermore, entities operating in the UAE (especially ADGM, DIFC, and multinational groups) require multi-currency reporting, FX revaluation, and parallel accounting books (e.g. IFRS Statutory Book vs. Management/Tax Book).

## Decision
1. **Append-Only Immutability**:
   - Journal entries and postings are strictly immutable. Once posted, an entry cannot be modified or deleted.
   - Corrections require explicit reversing or adjusting entries linked to the original posting.
   - Every posting operation emits an append-only event (`JournalEntryPostedEvent`).

2. **Money and Precision**:
   - Money values are represented as integer minor units (e.g. AED 1,000.50 is stored as `100050` fils using `BigInt`).
   - ISO-4217 standard currency codes dictate minor unit exponents (e.g., AED = 2, USD = 2, JPY = 0, BHD/KWD = 3).
   - Exchange rates are stored with high precision (e.g., up to 8 decimal places: `12345678` with a scale factor of `10^8`).
   - Rounding algorithm is strictly deterministic: Half-Even (Banker's Rounding) applied at transaction line calculation.

3. **Invariants**:
   - Invariant 1: Total debits must equal total credits per entry (`sum(debits) - sum(credits) == 0`).
   - Invariant 2: Transaction currency balance (`debit_amount_txn == credit_amount_txn`) and base currency balance (`debit_amount_base == credit_amount_base`) must balance independently. Discrepancies arising from multi-line FX are balanced into an explicit FX rounding line item.
   - Invariant 3: Closed accounting periods cannot accept new postings without an auditable, supervisor-approved unlock event.

4. **Multi-Book Support**:
   - Transactions are posted to specific books (`BookType`: `STATUTORY_IFRS`, `TAX_UAE`, `MANAGEMENT`).
   - Common transactions flow automatically to all linked books, while book-specific adjustments (e.g. IFRS 16 lease adjustments vs. tax depreciation) post only to designated secondary books.

## Consequences
- Guarantees zero floating-point errors and exact FTA drill-down audit trail.
- Database queries compute balances by summing lines or maintaining pre-aggregated period balance snapshots.
- Requires strict validation middleware in `packages/ledger-core`.
