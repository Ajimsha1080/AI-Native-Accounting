# ADR 0005: "Buy vs Build" Strategy for Commodity Capabilities

## Status
Accepted

## Context
Building a commercial, AI-native ERP for UAE mid-market groups requires high engineering velocity while focusing differentiated efforts on the **perpetual double-entry core, continuous close workflows, UAE tax localization (VAT/CT), and AI financial copilot/agents**. 

Commodity integrations (bank feeds, e-invoicing accreditation, document extraction/OCR, authentication, and subscription billing) carry substantial maintenance overhead, complex bilateral regulatory accreditations, and commoditized solutions in the market.

## Decision
We establish a strict **Buy vs Build** policy:

1. **Bank Connectivity (BUY)**:
   - *Decision:* Do not build bespoke scrapers or direct host-to-host integrations for 20+ UAE banks.
   - *Approach:* Build an extensible adapter interface (`BankFeedAggregatorAdapter`) and integrate licensed UAE Open Finance aggregators (such as **Lean Technologies** or **Tarabut Gateway**). Supplement with robust file import support (MT940, CAMT.053, corporate CSV).
   - *Rationale:* Financial aggregation in the UAE is regulated by the Central Bank; aggregators maintain direct bank API relationships and SCA compliance.

2. **E-Invoicing Accredited Service Provider (ASP) (BUY / PARTNER)**:
   - *Decision:* LedgerAE will **not** attempt to become an accredited Peppol ASP / Access Point provider.
   - *Approach:* Implement the standard OASIS UBL 2.1 PINT-AE generation engine (`packages/ubl-pinta-generator`), and integrate with accredited service providers (e.g., Pagero, Avalara, or Storecove) via a pluggable `AspAdapter`.
   - *Rationale:* Peppol accreditation requires physical PKI HSM infrastructure, 24/7 telecommunications NOCs, and continuous interoperability audits.

3. **Authentication, 2FA, and UAE PASS (BUY / LEVERAGE PROVEN LIBS)**:
   - *Decision:* Do not write custom crypto or session management engines from scratch.
   - *Approach:* Utilize established, hardened identity frameworks (Passport / Auth.js / WorkOS) with standard TOTP 2FA, SAML/SCIM, and UAE PASS OpenID Connect (OIDC).
   - *Rationale:* Eliminates identity tampering risks and accelerates SOC 2 / ISO 27001 readiness.

4. **Document Intelligence & OCR (HYBRID EVALUATION ROUTE)**:
   - *Decision:* Leverage hosted multimodal LLMs (Anthropic Claude 3.5 Sonnet tool use) as primary zero-shot document extractor in TypeScript.
   - *Fallback:* Maintain Python microservice (`services/ai-service`) with EasyOCR / PyMuPDF only if hosted multimodal extraction fails the bilingual Arabic/English accuracy benchmark ($< 95\%$).

5. **Subscription Billing & Usage Metering (BUY)**:
   - *Decision:* Use Stripe Billing or a UAE-compliant payment gateway (e.g., Checkout.com / Stripe) for subscription management and AI token / e-invoice transaction metering.

## Consequences
- Maximizes engineering resources on core ledger correctness, UAE compliance, and continuous-close workflows.
- Reduces time-to-market for R1 pilot customer delivery.
