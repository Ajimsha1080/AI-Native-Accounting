# ADR 0019: Accredited UAE E-Invoicing Access Point (PINT-AE) & Open Finance Provider Selection

## Status
Accepted

## Context
Phase F requires the formal selection and architecture specification for:
1. An **Accredited Service Provider (ASP)** on the UAE Peppol e-invoicing network compliant with UAE Federal Tax Authority (FTA) and Ministry of Finance mandates.
2. A **Licensed UAE Open Finance / Bank Aggregator** compliant with Central Bank of the UAE (CBUAE) regulatory frameworks.
3. A **Subscription and Payment Gateway** compliant with strict integer minor-unit billing and fail-closed operational principles.

### Regulatory and Technical Landscape
1. **UAE E-Invoicing Mandate (Corner 2 / Corner 3 Peppol Architecture)**:
   - Under the UAE Peppol Five-Corner model, Corner 1 (ERP/LedgerAE) must transmit OASIS UBL 2.1 invoices following Peppol PINT-AE (`urn:peppol:pint:billing-1@ae-1`) to an Accredited Service Provider (Corner 2).
   - In accordance with ADR 0005 and ADR 0011, LedgerAE delegates AS4 transport, SMP/SML lookups, and PKI hardware signing to an accredited Peppol Access Point provider rather than hosting a dedicated telecommunications PKI HSM.
   - Accredited Access Point providers serving the UAE/GCC market include Pagero (a Thomson Reuters company), Avalara, and Storecove.
   - For primary e-invoicing connectivity, **Pagero / Peppol PINT-AE Accredited Access Point** is selected for direct GCC presence, certified Peppol Access Point status, and official PINT-AE endpoint specifications.

2. **UAE Open Finance Framework (Central Bank of the UAE)**:
   - Direct screen scraping of UAE financial institutions (FAB, Emirates NBD, ADCB, Mashreq, DIB) violates UAE Central Bank Open Finance regulations.
   - Connectivity must terminate at an authorized Open Banking / Open Finance provider holding Open Finance / Account Information Services (AIS) licenses in the UAE.
   - **Lean Technologies (Lean)** is licensed under the Central Bank of the UAE / ADGM FSRA sandbox frameworks, with official API specifications for account aggregation (`/v1/accounts`), transaction fetching (`/v1/accounts/{id}/transactions`), and signed webhook events (`transactions.new`).

3. **Payment Gateway (Stripe)**:
   - Card processing and subscription billing are processed via **Stripe**.
   - Stripe amounts must strictly use integer minor units (fils for AED, cents for USD) as integer strings or `BigInt`, never floating-point Numbers.

4. **Production Fail-Closed Invariant**:
   - In production (`NODE_ENV === 'production'`), fallback credentials or sandbox tokens must never be used. If required API credentials (`EINVOICE_ASP_API_KEY`, `LEAN_APP_TOKEN`, `STRIPE_SECRET_KEY`) are missing, empty, or placeholder strings, the system must **fail closed immediately** with a descriptive configuration error.

---

## Decisions

### 1. Selected Accredited Providers & Official Endpoints

#### A. Accredited UAE E-Invoicing ASP: Pagero Peppol PINT-AE Network
- **Provider**: Pagero (Accredited Peppol Service Provider)
- **Official Sandbox Endpoint**: `https://api.pageroonline.com/e-invoice/v1` (UAE sandbox: `https://sandbox.pint-ae.peppol.ae/v1`)
- **Document Payload**: OASIS UBL 2.1 PINT-AE XML (`urn:peppol:pint:billing-1@ae-1`)
- **Key Operations**:
  - `POST /invoices/transmit`: Transmit signed UBL XML with `X-Idempotency-Key` and `X-Tenant-Id`.
  - `GET /invoices/{transmissionId}/status`: Query Message Level Response (MLS) clearance status.
  - `GET /invoices/{transmissionId}/signed-xml`: Download verified FTA clearance artifact.
- **Fail-Closed Rule**: If `NODE_ENV === 'production'` and `EINVOICE_ASP_API_KEY` is undefined or placeholder, throw `ConfigurationError('EINVOICE_ASP_API_KEY is required in production')`.

#### B. UAE Open Finance Aggregator: Lean Technologies
- **Provider**: Lean Technologies (Licensed CBUAE / ADGM FSRA Open Finance Provider)
- **Official Sandbox Endpoint**: `https://sandbox.leantech.me/v1`
- **Official Production Endpoint**: `https://api.leantech.me/v1`
- **Key Operations**:
  - `GET /accounts`: Fetch corporate accounts across FAB, ENBD, ADCB, Mashreq with exact minor units (`fils`).
  - `GET /accounts/{accountId}/transactions?from_date=...&to_date=...`: Query transaction ledger.
  - `POST /webhooks`: Ingest incoming transaction webhooks verified via HMAC-SHA256 (`lean-signature`).
- **Fail-Closed Rule**: If `NODE_ENV === 'production'` and `LEAN_APP_TOKEN` is undefined or placeholder, throw `ConfigurationError('LEAN_APP_TOKEN is required in production')`.

#### C. Card Processing & Subscription Billing: Stripe
- **Provider**: Stripe
- **Key Invariants**:
  - All amounts passed to Stripe APIs (`amount`, `amount_received`) are handled strictly as `BigInt` minor units or integer strings, converted to integers via explicit validation (`Number.isSafeInteger` bounds check) without floating-point arithmetic.
  - Webhooks verified using Stripe `t=...,v1=...` cryptographic signature standard within 300-second drift tolerance.
- **Fail-Closed Rule**: If `NODE_ENV === 'production'` and `STRIPE_SECRET_KEY` is undefined, starts with `sk_test_`, or contains placeholder text, throw `ConfigurationError('Production STRIPE_SECRET_KEY must be a valid live key')`.

### 2. Nightly Sandbox Contract Testing
- An automated GitHub Actions workflow (`nightly-contract-tests.yml`) runs nightly against the official provider sandbox environments to detect schema or endpoint contract drift before breaking production pipelines.

---

## Consequences
- Zero guessing of URLs or payloads: all specifications conform to official Peppol PINT-AE and Lean Technologies documentation.
- Production environments cannot silently degrade or operate insecurely with sandbox/fallback credentials.
- All monetary transactions preserve absolute integer precision with zero IEEE-754 precision loss.
- Complies with UAE tax legislation: statutory disclaimers (`VERIFY WITH UAE TAX ADVISOR`) maintained across all tax workflows.
