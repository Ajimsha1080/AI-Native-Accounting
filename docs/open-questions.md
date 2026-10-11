# Open Questions and UAE Regulatory Gaps

This document tracks unresolved regulatory details, external integration vendor specifications, and operational gaps where official UAE legislation or technical standards require verification or external vendor selection.

---

## 1. Regulatory Gaps (VERIFY WITH UAE TAX ADVISOR)

| ID | Topic | Current State & System Implementation | Pending Official Resolution / Advisor Verification | Risk Level |
| :--- | :--- | :--- | :--- | :--- |
| **REG-01** | **E-Invoicing Phasing & Timeline** | UAE Ministry of Finance announced Peppol-based e-invoicing (PINT-AE). System models standard OASIS UBL 2.1 PINT-AE. | Specific phase rollout dates (Wave 1, 2, 3) and exact mandatory accreditation thresholds for mid-market groups (e.g. revenue > AED 50M). Dates are data-driven in rules module. | Medium |
| **REG-02** | **Designated Free Zone Goods Transfers** | Implemented per Cabinet Decision No. 59 of 2017 & VATP033 (Zone-to-Zone out of scope under customs seal; Zone-to-Mainland treated as import/RCM). | Specific documentation requirements (e.g. customs declarations, bayans, transit bonds) needed to substantiate 0% / out-of-scope treatment upon FTA tax audit. | High |
| **REG-03** | **Qualifying Free Zone Person (QFZP) De-Minimis Monitoring** | Computed per Cabinet Decision No. 139 of 2023: non-qualifying revenue must not exceed $\le 5\%$ or AED 5,000,000. | Treatment of intellectual property (IP) income, headquarter services, and intercompany free zone transactions under evolving ministerial decisions. | High |
| **REG-04** | **Direct FTA VAT 201 API Filing** | System produces 100% FTA-compliant JSON/XML data matching FTA portal boxes and drill-down audit files. | Does the FTA provide an authenticated direct M2M filing API for commercial ERPs, or is filing strictly restricted to EmaraTax portal manual entry/upload? | Low (Manual export supported) |
| **REG-05** | **Statutory Data Retention & Legal Hold** | Configured default: 5 years for mainland VAT (Article 78), 7 years for capital assets / real estate, 10 years for e-invoices. | Confirmation of DIFC / ADGM commercial company regulations regarding accounting book preservation (typically 6-10 years). | Low |

---

## 2. Technical & Integration Gaps (Buy vs Build Vendor Decisions)

| ID | Area | Selected Strategy | Open Technical Evaluation |
| :--- | :--- | :--- | :--- |
| **INT-01** | **UAE Open Banking / Bank Feeds** | Pluggable aggregator adapter interface with fallback to MT940 / CAMT.053 / CSV import. | Vendor evaluation between **Tarabut Gateway**, **Lean Technologies**, and **Dapi** for corporate UAE banking coverage (FAB, ENBD, ADCB, Mashreq, Wio). |
| **INT-02** | **Accredited Service Provider (ASP)** | ASP adapter interface (`AspAdapter`) with sandbox mock. | Partnership selection with MoF/FTA accredited ASPs (e.g. Avalara, Pagero/Thomson Reuters, Storecove, EDICOM). |
| **INT-03** | **Identity & Authentication (UAE PASS)** | Auth.js / Passport with local JWT + TOTP 2FA, with UAE PASS OIDC mock adapter. | UAE PASS Staging environment credentials and Digital Trust accreditation for production corporate single sign-on. |
