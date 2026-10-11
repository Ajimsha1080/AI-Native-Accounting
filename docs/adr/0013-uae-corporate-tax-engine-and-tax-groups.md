# ADR 0013: UAE Corporate Tax Engine, Special Regimes, and Form CT201 Return Architecture

## Status
Accepted

## Context
Under **Federal Decree-Law No. 47 of 2022 on the Taxation of Corporations and Businesses** (effective for financial years beginning on or after 1 June 2023) and subsequent Cabinet & Ministerial Decisions, UAE taxable persons face statutory tax compliance obligations with distinct statutory regimes:

1. **Standard Corporate Tax Regime (Article 3)**:
   - 0% on taxable income up to AED 375,000 (37,500,000 fils).
   - 9% statutory rate on taxable income in excess of AED 375,000.
2. **Accounting-to-Tax Adjustments**:
   - **Article 32**: 50% disallowance on customer and employee entertainment expenditure.
   - **Article 33**: 100% disallowance on penalties, fines, bribes, and non-qualifying donations.
   - **Article 30**: General Interest Deduction Limitation capping net interest expenditure at 30% of EBITDA with an annual de-minimis safe-harbour threshold of AED 12,000,000.
   - **Article 22**: Participation Exemption for dividends and capital gains derived from qualifying domestic and foreign shareholdings.
3. **Small Business Relief (SBR - Article 21 & Ministerial Decision No. 73 of 2023)**:
   - Available to resident taxable persons with gross revenue $\le \text{AED } 3,000,000$ in the relevant and prior tax periods.
   - Electing entities are treated as having no taxable income (0% tax liability).
4. **Qualifying Free Zone Persons (QFZP - Cabinet Decision No. 139 of 2023 & Ministerial Decision No. 265 of 2023)**:
   - 0% corporate tax rate on Qualifying Income derived from qualifying activities and transactions with other Free Zone persons.
   - **De-Minimis Requirement**: Non-qualifying revenue must not exceed the lower of:
     - 5% of total revenue, OR
     - AED 5,000,000.
   - Breaching de-minimis disqualifies the person from the 0% regime for 5 years, subjecting their entire taxable income to the standard 9% rate.
5. **Tax Loss Relief (Article 37)**:
   - Tax losses can be carried forward indefinitely.
   - The maximum tax loss relief offset in any single tax period is strictly capped at **75% of taxable income before losses**.
6. **Related Party Disclosures & Transfer Pricing (Articles 34 & 55)**:
   - Transactions with related parties and connected persons must adhere to the arm's length principle and be scheduled for disclosure.
7. **Official Filing Requirements**:
   - The Federal Tax Authority (FTA) requires submission of Form CT201 via the EmaraTax portal within 9 months of the financial year-end.

## Decision
1. **Deterministic BigInt Tax Computation Engine (`calculateCorporateTax`)**:
   - Built inside `@ledger-ae/uae-tax-engine` with integer fils arithmetic and Banker's Rounding (`roundHalfEven`). Zero floating-point math.
   - Applies strict hierarchical evaluation:
     - SBR eligibility evaluation ($\le \text{AED } 3\text{M}$).
     - Accounting add-backs (50% entertainment, 100% penalties, net interest cap).
     - Statutory deductions (dividends participation exemption).
     - Article 37 loss relief cap (strictly $\le 75\%$ of pre-loss taxable income) with exact tracking of unutilized losses carried forward.
     - QFZP de-minimis validation ($\le \min(5\%, \text{AED } 5\text{M})$).
     - Standard 9% computation on taxable income exceeding AED 375,000.
2. **Form CT201 Return-Ready Export Generator (`generateCorporateTaxReturnExport`)**:
   - Generates structured, EmaraTax-compatible Corporate Tax Return schedules.
   - Itemizes Section 1 (Accounting-to-Tax Reconciliation), Section 2 (Loss Relief & Regimes), Section 3 (Liability Computation), Section 4 (Transfer Pricing & Related Party Schedule), and Section 5 (Statutory Legal References).
3. **Regulatory Verification Safeguard**:
   - Every calculation result explicitly embeds `verifyWithTaxAdvisor: true` and cites relevant Federal Decree-Laws and Cabinet Decisions.

## Consequences
- Enables UAE commercial groups and free zone entities to compute precise corporate tax liabilities directly from their IFRS trial balances.
- Automates complex de-minimis tests, SBR elections, and loss relief caps with zero manual spreadsheet errors.
- Fully auditable by FTA registered tax agents and external Big 4 auditors.
