# ADR 0011: UAE E-Invoicing Peppol Five-Corner Model, PINT-AE UBL 2.1, and ASP Adapter Architecture

## Status
Accepted

## Context
The UAE Ministry of Finance and Federal Tax Authority (FTA) have mandated electronic invoicing for B2B and B2G transactions adopting the decentralized **Peppol Five-Corner Model**:
- **Corner 1**: Supplier / Seller ERP (LedgerAE).
- **Corner 2**: Sender's Accredited Service Provider (ASP / Peppol Certified Access Point).
- **Corner 3**: Receiver's Accredited Service Provider (ASP / Peppol Certified Access Point).
- **Corner 4**: Buyer / Customer ERP.
- **Corner 5**: UAE Federal Tax Authority (FTA e-invoicing data exchange and reporting repository).

Statutory & Technical Mandates:
1. **PINT-AE Specification**: Electronic documents must strictly comply with the Peppol International (PINT) UAE data model based on OASIS UBL 2.1 (`CustomizationID: urn:peppol:pint:billing-1@ae-1`, `ProfileID: urn:peppol:bis:billing`).
2. **Document Types**: Support for Commercial Tax Invoices (type `380`), Credit Notes (type `381` with mandatory `BillingReference` linking to the original invoice), and Debit Notes (type `383`).
3. **Pluggable ASP Connectivity (Buy vs Build)**: As established in ADR 0005, LedgerAE partners with accredited Peppol ASPs (e.g., Pagero, Avalara, Storecove) rather than operating a dedicated telecommunications PKI hardware security module (HSM).
4. **Resilience & Failure Queues**: Network timeouts or transient ASP gateway outages (HTTP 503) must never drop invoices. The system must retry with backoff and route unrecoverable failures to a monitored Dead Letter Queue (DLQ).
5. **10-Year Immutable Archiving**: UAE Federal Decree-Law No. 8 of 2017 Article 78 mandates a minimum 5-to-10 year audit preservation window with cryptographic non-repudiation.

## Decision
1. **OASIS UBL 2.1 PINT-AE Engine (`packages/ubl-pinta-generator`)**:
   - Generates compliant XML structures containing supplier/customer TRNs, itemized line extensions, classified VAT categories (`S`, `Z`, `E`, `O`), and legal monetary totals formatted via `formatMoney`.
   - Generates Credit Notes (381) with `<cac:BillingReference>` referencing original tax invoice IDs.
   - Includes bidirectional parser (`parseReceivedUblPintaXml`) to ingest incoming vendor bills from Corner 3.
2. **Pluggable ASP Adapter & Sandbox Mock (`SandboxAspAdapter`)**:
   - Validates Peppol PINT headers, statutory 15-digit TRNs, and returns standard Peppol Message Level Responses (MLS) containing clearance UUIDs.
3. **Durable Transmission & Retry Queue (`EinvoicingTransmissionQueue`)**:
   - Distinguishes permanent validation rejections (`PERMANENT_REJECTED`) from transient network failures (`FAILED_TRANSIENT`).
   - Retries transient errors up to `maxAttempts` (default 3); upon exhaustion, transfers items to the `DEAD_LETTER_QUEUE` with operational alerts.
4. **10-Year Cryptographic Archiving (`EinvoiceArchiveRepository`)**:
   - Stores raw UBL XML with computed SHA-256 checksums, retention timestamps (+10 years), and FTA clearance references.
   - Provides tamper-evident verification via `verifyArchiveIntegrity`.

## Consequences
- Full statutory compliance with upcoming UAE Peppol PINT-AE e-invoicing mandates.
- Seamless inter-company e-invoicing without human data entry.
- Zero lost invoices during ASP maintenance windows or cloud outages.
