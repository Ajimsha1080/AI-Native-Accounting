# ADR 0015: Public API, Model Context Protocol (MCP), Accounting Firm Portal, Usage Metering, and Migration Architecture

## Status
Accepted

## Context
Mid-market UAE enterprises and external accounting firms require open integration, platform automation, multi-client management, and predictable billing:
1. **Public API & External Client Integration**:
   - External systems (e-commerce, point of sale, CRM) require RESTful endpoints to post journal vouchers and trigger e-invoices.
   - Requires mandatory tenant scoping (`x-tenant-id`) and **Idempotency Keys** (`x-idempotency-key`) to guarantee at-most-once financial posting semantics.
   - Outbound webhooks must emit cryptographically signed payloads (HMAC SHA-256) upon ledger events (`journal.posted`, `einvoice.cleared`).
2. **Model Context Protocol (MCP) Server Expansion**:
   - AI clients (Claude Desktop, Antigravity, Cursor) require structured financial query tools.
   - **Security Principle**: All read tools (`get_trial_balance_summary`, `query_vat201_summary`) are unconstrained for authorized callers. All write tools require either dual-control human CFO approval tokens (`CFO_APPROVED_*`) or must create unposted proposals (`create_adjustment_proposal`).
3. **Accounting Firm Multi-Client Workspace**:
   - UAE auditing and accounting firms manage multiple separate client entities across mainland and free zones.
   - Requires strict multi-client scoping: junior and senior accountants are restricted solely to their explicitly assigned client tenants, while managing partners retain portfolio-wide visibility.
4. **Billing & Usage Metering Engine**:
   - Tracks tenant consumption per monthly billing cycle:
     - AI input/output tokens and cost in AED fils.
     - E-invoicing transmissions count.
     - Active entity count (base 3 entities + additional entities at AED 300/month).
   - Enforces automated budget alerts at $80\%$ warning and $100\%$ critical thresholds.
   - Generates itemized monthly tax invoices complying with UAE VAT ($5\%$).
5. **Migration Importers**:
   - UAE businesses migrating from Zoho Books, QuickBooks Online, or Tally Prime require automated Chart of Accounts and Opening Balance importers.
   - Invariant: Opening balance debits must exactly equal opening balance credits with zero fils discrepancy.

## Decision
1. **Public API Subsystem (`LedgerApiController`)**:
   - Built with idempotency key caching, tenant validation, and HMAC SHA-256 signed webhook dispatching in `apps/api`.
2. **MCP Server (`LedgerMcpServer`)**:
   - Expanded in `@ledger-ae/mcp-server` to expose read tools and `create_adjustment_proposal` to ensure AI agents never mutate the ledger autonomously.
3. **Firm Workspace (`AccountingFirmWorkspace`)**:
   - Implements role-based access control (`FIRM_PARTNER`, `STAFF_ACCOUNTANT`, `EXTERNAL_AUDITOR`).
   - Throws `UnauthorizedClientScopeError` on any unauthorized cross-client access attempt.
4. **Metering Engine (`BillingMeteringEngine`)**:
   - Built with deterministic `BigInt` minor units tracking AI tokens, e-invoice counts, and entity tiers.
   - Calculates itemized group statements with $5\%$ UAE VAT.
5. **Migration Engine (`MigrationImporterEngine`)**:
   - Provides pure TypeScript parsers for Zoho Books, QBO, and Tally Prime exports, translating legacy structures into standard UAE accounts.

## Consequences
- Enables seamless external partner and ecosystem integration without risking duplicate postings.
- Protects client confidentiality across CPA firm client portfolios.
- Provides transparent usage tracking and cost guardrails for AI operations.
