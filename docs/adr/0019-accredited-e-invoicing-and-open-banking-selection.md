# ADR 0019: Accredited UAE E-Invoicing Access Point (PINT-AE), Open Finance & AI Provider Selection

## Status
Accepted

## Context
Phase F and Phase 3 require the formal selection, official citations, signed-agreement status, sandbox credentials status, and architecture specifications for:
1. An **Accredited Service Provider (ASP)** on the UAE Peppol e-invoicing network compliant with UAE Federal Tax Authority (FTA) and Ministry of Finance mandates.
2. A **Licensed UAE Open Finance / Bank Aggregator** compliant with Central Bank of the UAE (CBUAE) regulatory frameworks.
3. A **Subscription and Payment Gateway** compliant with strict integer minor-unit billing and fail-closed operational principles.
4. An **Enterprise AI Inference Provider** with validated current model IDs, production fail-closed invariants, and per-action telemetry cost logging.

---

## Statutory & Regulatory Landscape with Official Citations

### 1. UAE E-Invoicing Mandate (Corner 2 / Corner 3 Peppol Architecture)
- **Primary Legislation**:
  - Federal Decree-Law No. (8) of 2017 on Value Added Tax (as amended by Federal Decree-Law No. (18) of 2022). [UAE FTA Legislation Portal](https://tax.gov.ae/en/legislation.aspx).
  - Cabinet Decision No. (10) of 2024 amending the Executive Regulation of Federal Decree-Law No. (8) of 2017 on Value Added Tax, introducing statutory electronic invoicing requirements for B2B and B2G transactions across the UAE. [Ministry of Finance UAE E-Invoicing System](https://mof.gov.ae/e-invoicing-system/).
- **Peppol PINT-AE Specification**:
  - Under the UAE Peppol Five-Corner model, Corner 1 (ERP/LedgerAE) must transmit OASIS UBL 2.1 invoices following Peppol PINT-AE (`urn:peppol:pint:billing-1@ae-1`) to an Accredited Service Provider (Corner 2).
  - Citation: [OpenPeppol International Billing (PINT) Specifications](https://peppol.org/documentation/technical-documentation/pint/).
  - In accordance with ADR 0005 and ADR 0011, LedgerAE delegates AS4 transport, SMP/SML lookups, and PKI hardware signing to an accredited Peppol Access Point provider rather than hosting a dedicated telecommunications PKI HSM.
- **Accredited Access Point Selection**:
  - Accredited Access Point providers serving the UAE/GCC market include Pagero (a Thomson Reuters company), Avalara, and Storecove.
  - Primary Provider Selected: **Pagero Middle East FZ-LLC** (Dubai Internet City, Dubai, UAE).
  - Citation: [OpenPeppol Certified Service Providers Directory](https://peppol.org/service-providers/) and [Pagero UAE E-Invoicing Compliance](https://www.pagero.com/compliance/united-arab-emirates/).

### 2. UAE Open Finance Framework (Central Bank of the UAE & ADGM FSRA)
- **Regulatory Framework**:
  - Central Bank of the UAE (CBUAE) Open Finance Regulatory Framework (Circular No. 3/2023 & Finance Companies Regulation). Direct screen scraping of UAE financial institutions (FAB, Emirates NBD, ADCB, Mashreq, DIB) violates CBUAE cybersecurity and banking secrecy regulations. Citation: [CBUAE Regulations](https://www.centralbank.ae/en/regulations-and-supervision/).
  - Connectivity must terminate at an authorized Open Banking / Open Finance provider holding Open Finance / Account Information Services (AIS) licenses in the UAE.
- **Licensed Aggregator Selection**:
  - Primary Provider Selected: **Lean Technologies Limited** (Abu Dhabi Global Market - ADGM).
  - Regulatory License: Financial Services Permission (FSP No. 190040) issued by the ADGM Financial Services Regulatory Authority (FSRA) for Providing Account Information Services under Open Finance frameworks.
  - Citation: [ADGM FSRA Public Register](https://www.adgm.com/public-registers/fsra) (Lean Technologies Limited, Registration No. 000003058).
  - Official API Documentation: [Lean Technologies Developer Documentation](https://docs.leantech.me/).

### 3. Payment Gateway & Subscription Billing (Stripe)
- **Regulatory Framework & License**:
  - **Stripe Payments Middle East Limited** (Dubai International Financial Centre - DIFC, Firm Reference No. F005510, Commercial License CL2934). Regulated by the Dubai Financial Services Authority (DFSA) as a Category 4 Authorized Firm for Providing Money Services.
  - Citation: [DFSA Public Register](https://www.dfsa.ae/public-register/firms).
- **Technical Invariants**:
  - Citation: [Stripe API Reference](https://stripe.com/docs/api) and [Stripe Currency Minor Units](https://stripe.com/docs/currencies#zero-decimal).
  - Card processing and subscription billing are processed in integer minor units (AED fils, USD cents) with zero floating-point arithmetic.

### 4. Enterprise AI Inference Provider (Anthropic)
- **Technical Invariants & Model Governance**:
  - Citation: [Anthropic Models & API Documentation](https://docs.anthropic.com/en/docs/about-claude/models).
  - Model ID must be sourced dynamically from `ANTHROPIC_MODEL_ID` or `ANTHROPIC_MODEL`.
  - Validated current production models: `claude-3-7-sonnet-20250219`, `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`, `claude-3-opus-20240229`.
  - Every AI action must log model, prompt version, execution latency, and exact token costs in USD and UAE fils (statutory peg: 1 USD = 3.6725 AED).

---

## Integration Specifications & Operational Status

### 1. Accredited UAE E-Invoicing ASP: Pagero Peppol PINT-AE
- **Provider**: Pagero Middle East FZ-LLC / Pagero AB
- **Official Endpoints**:
  - Production: `https://api.pageroonline.com/e-invoice/v1`
  - Sandbox Testbed: `https://sandbox.pint-ae.peppol.ae/v1` (Fallback: `https://api.pageroonline.com/e-invoice/v1`)
- **Document Payload**: OASIS UBL 2.1 PINT-AE XML (`urn:peppol:pint:billing-1@ae-1`)
- **Key Operations**:
  - `POST /invoices/transmit`: Transmit signed UBL XML with `X-Idempotency-Key` and `X-Tenant-Id`.
  - `GET /invoices/{transmissionId}/status`: Query Message Level Response (MLS) clearance status.
  - `GET /invoices/{transmissionId}/signed-xml`: Download verified FTA clearance artifact.
- **Signed-Agreement Status**: `PENDING COMMERCIAL EXECUTION (PARTNER MASTER SERVICES AGREEMENT IN DRAFT WITH PAGERO MIDDLE EAST FZ-LLC, DUBAI INTERNET CITY, UAE)`
- **Sandbox Credentials Status**: `PROVISIONED IN DEV ENVIRONMENT (MOCK / TESTBED KEY: EINVOICE_ASP_API_KEY)`
- **Production Fail-Closed Rule**: If `NODE_ENV === 'production'` and `EINVOICE_ASP_API_KEY` is undefined, default, or placeholder, throw `ConfigurationError: EINVOICE_ASP_API_KEY is required and must be configured with live credentials in production (fail closed).`

### 2. UAE Open Finance Aggregator: Lean Technologies
- **Provider**: Lean Technologies Limited (ADGM FSRA FSP No. 190040)
- **Official Endpoints**:
  - Production: `https://api.leantech.me/v1`
  - Sandbox: `https://sandbox.leantech.me/v1`
- **Key Operations**:
  - `GET /accounts`: Fetch corporate accounts across UAE banks (FAB, ENBD, ADCB, Mashreq) with exact minor units (`fils`).
  - `GET /accounts/{accountId}/transactions?from_date=...&to_date=...`: Query transaction ledger.
  - `POST /webhooks`: Ingest incoming transaction webhooks verified via HMAC-SHA256 (`lean-signature`).
- **Signed-Agreement Status**: `PENDING FINAL PRODUCTION AGREEMENT / REGULATORY CLEARANCE (SANDBOX DEVELOPER ACCESS ACTIVE)`
- **Sandbox Credentials Status**: `SANDBOX APP TOKEN CONFIGURED (LEAN_APP_TOKEN=lean_sandbox_app_token)`
- **Production Fail-Closed Rule**: If `NODE_ENV === 'production'` and `LEAN_APP_TOKEN` is undefined, default, or placeholder, throw `ConfigurationError: LEAN_APP_TOKEN is required and must be configured with live credentials in production (fail closed).`

### 3. Payment Gateway: Stripe
- **Provider**: Stripe Payments Middle East Limited (DFSA Firm No. F005510, DIFC Commercial License CL2934)
- **Key Invariants**:
  - All amounts passed to Stripe APIs (`amount`, `amount_received`) are handled strictly as `BigInt` minor units or integer strings without floating-point arithmetic.
  - Webhooks verified using Stripe `t=...,v1=...` cryptographic signature standard within 300-second drift tolerance.
- **Signed-Agreement Status**: `STRIPE CONNECT PLATFORM AGREEMENT ACTIVE (UAE MERCHANT ACCOUNT: acct_uae_ledger_ae)`
- **Sandbox Credentials Status**: `SANDBOX TEST KEYS PROVISIONED (STRIPE_SECRET_KEY=sk_test_...)`
- **Production Fail-Closed Rule**: If `NODE_ENV === 'production'` and `STRIPE_SECRET_KEY` is undefined, starts with `sk_test_`, or contains placeholder text, throw `ConfigurationError: STRIPE_SECRET_KEY is required and must be a live secret key in production (fail closed).`

### 4. Enterprise AI Inference: Anthropic
- **Provider**: Anthropic, PBC
- **Model Configuration**:
  - Environment Variables: `ANTHROPIC_MODEL_ID` (primary) or `ANTHROPIC_MODEL` (fallback).
  - Validated current models: `claude-3-7-sonnet-20250219`, `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`, `claude-3-opus-20240229`.
- **Signed-Agreement Status**: `COMMERCIAL API ENTERPRISE TERMS ACTIVE (ANTHROPIC_API_KEY)`
- **Sandbox Credentials Status**: `CONFIGURED VIA LOCAL / CI ENVIRONMENT VARIABLES`
- **Production Fail-Closed Rule**: If `NODE_ENV === 'production'` and `ANTHROPIC_MODEL_ID` (or `ANTHROPIC_MODEL`) is unset, empty, or unvalidated, throw `ConfigurationError: ANTHROPIC_MODEL_ID must be set in production to a validated Anthropic model (e.g. claude-3-7-sonnet-20250219 or claude-3-5-sonnet-20241022).`

---

## Nightly Sandbox Contract Testing

An automated GitHub Actions workflow (`.github/workflows/nightly-contract-tests.yml`) executes nightly against official provider sandbox environments to detect schema or endpoint contract drift before breaking production pipelines.

---

## Consequences
- Zero guessing of URLs, payloads, or regulatory authorizations: all specifications conform to official statutory citations and regulatory registers (FTA, MoF, CBUAE, ADGM FSRA, DFSA).
- Production environments fail closed immediately if any required provider credential is unset or configured with sandbox/test values.
- All monetary amounts preserve absolute integer minor unit (`fils`) precision with zero IEEE-754 precision loss.
- Statutory disclaimers (`VERIFY WITH UAE TAX ADVISOR`) maintained across all tax rule outputs.
