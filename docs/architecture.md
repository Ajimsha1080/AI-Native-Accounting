# LedgerAE: System Architecture Document

```mermaid
flowchart TB
    subgraph Clients["Presentation & Integration Layer"]
        WebClient["Next.js 15 Web App\n(RTL, i18n ar/en, TanStack Table)"]
        MobileClient["Mobile Web / PWA"]
        MCPAgent["External AI Clients\n(Claude Desktop / Cursor via MCP)"]
        ExternalSystems["External ERPs / Banks / Webhooks"]
    end

    subgraph Gateway["API Gateway & Security Layer"]
        WAF["Cloudflare WAF / UAE PoP"]
        APIGateway["NestJS API Gateway\n(AuthN, AuthZ RBAC, Rate Limiting, Idempotency)"]
        MCPServer["LedgerAE MCP Server\n(Read-Scoped, Token-Gated Writes)"]
    end

    subgraph CoreServices["NestJS Modular Monolith Core Engine"]
        TenancyService["Tenant & Org Engine\n(PostgreSQL RLS Context)"]
        LedgerCore["Append-Only Ledger Engine\n(Double-Entry, BigInt Minor Units, FX)"]
        TaxEngine["Versioned UAE Tax Engine\n(VAT 201, CT 9%, QFZP, Excise)"]
        APARModule["Order-to-Cash & Procure-to-Pay\n(Billing, Bills, 3-Way Match)"]
        BankModule["Banking & Reconciliation Engine\n(Open-Finance, MT940/CAMT)"]
        RevRecModule["IFRS 15 Rev-Rec Engine\n(Performance Obligations, Waterfalls)"]
        CloseModule["Continuous Close Engine\n(Checklists, Accruals, Period Lock)"]
        EInvoiceModule["UAE E-Invoicing (PINT-AE)\n(UBL 2.1 XML Generator)"]
    end

    subgraph TemporalCluster["Temporal Durable Workflow Engine"]
        WF_Close["Month-End Close Workflows"]
        WF_Agents["Autonomous Agent Execution"]
        WF_EInvoice["E-Invoice ASP Transmission & MLS"]
        WF_PayRuns["WPS & Bank Payment Runs"]
    end

    subgraph AIServices["Python AI & Document Services"]
        OCRService["FastAPI OCR Worker\n(PyMuPDF, EasyOCR Arabic/English)"]
        ContractAI["IFRS 15 Contract Clause Analyzer\n(Claude 3.5 Sonnet Tool Use)"]
        AnomalyDetector["Continuous AI Ledger Monitors\n(Duplicate, VAT, FX Outliers)"]
        EvalHarness["CI Eval Benchmark Harness"]
    end

    subgraph StorageLayer["Data & Persistence Tier (UAE Region)"]
        PGPrimary[("PostgreSQL 16 Multi-Tenant DB\n- Append-Only Journal Entries\n- RLS Tenant Isolation\n- pgvector Embeddings\n- Partitioned Tables")]
        RedisCache[("Redis Cluster\n- Session Cache\n- Distributed Locks\n- Rate Limits")]
        S3Storage[("S3 Object Storage (UAE Encrypted)\n- Invoices & Receipts (PDF/Images)\n- Immutable E-Invoice XML Archives\n- Evidence Packs")]
        OpenSearch[("OpenSearch\n- Transaction Full-Text & Audit Search")]
    end

    subgraph ExternalIntegrations["External Services & Regulators"]
        ASPNetwork["Accredited Service Providers (ASP)\n(UAE Peppol / PINT-AE Gateway)"]
        UAEBanks["UAE Banks (ENBD, FAB, ADCB)\n(Open Banking / WPS SIF)"]
        FTAPortal["Federal Tax Authority (FTA)\n(Export/Verify Portal)"]
        AnthropicAPI["Anthropic Claude API\n(Zero Data Retention, Tool Calls)"]
    end

    WebClient --> WAF --> APIGateway
    MobileClient --> WAF --> APIGateway
    MCPAgent --> MCPServer --> APIGateway
    ExternalSystems --> APIGateway

    APIGateway --> TenancyService
    APIGateway --> LedgerCore
    APIGateway --> TaxEngine
    APIGateway --> APARModule
    APIGateway --> BankModule
    APIGateway --> RevRecModule
    APIGateway --> CloseModule
    APIGateway --> EInvoiceModule

    LedgerCore <--> PGPrimary
    TenancyService <--> PGPrimary
    APARModule <--> PGPrimary
    BankModule <--> PGPrimary
    TaxEngine <--> PGPrimary

    APIGateway <--> RedisCache
    APIGateway <--> OpenSearch
    APARModule <--> S3Storage

    CoreServices <--> TemporalCluster

    TemporalCluster <--> AIServices
    AIServices <--> AnthropicAPI
    AIServices <--> S3Storage

    EInvoiceModule <--> ASPNetwork
    BankModule <--> UAEBanks
    TaxEngine -.-> FTAPortal
```

---

## 1. Monorepo Structure

```
ledger-ae/
├── apps/
│   ├── api/                    # NestJS Modular Monolith API
│   │   ├── src/
│   │   │   ├── auth/           # UAE PASS SSO, JWT, 2FA, RBAC
│   │   │   ├── tenants/        # Multi-tenant context & RLS interceptor
│   │   │   ├── ledger/         # Append-only journal & account services
│   │   │   ├── taxes/          # VAT, CT, QFZP endpoints & reports
│   │   │   ├── billing/        # Invoices, credit notes, payments
│   │   │   ├── bills/          # POs, GRNs, Vendor Bills, 3-way match
│   │   │   ├── banking/        # Statements, reconciliation engine
│   │   │   ├── close/          # Checklists, period locking, accruals
│   │   │   ├── einvoicing/     # PINT-AE generation & ASP client
│   │   │   └── temporal/       # Workflows & activities client
│   │   └── test/
│   ├── web/                    # Next.js 15 App Router (Tailwind, TanStack Table)
│   │   ├── src/
│   │   │   ├── app/            # App routes (en/ar with RTL support)
│   │   │   ├── components/     # UI primitives & financial widgets
│   │   │   ├── hooks/          # React query hooks
│   │   │   └── lib/            # i18n, formatting (AED, Hijri/Gregorian)
│   └── mcp-server/             # Model Context Protocol server for books
├── packages/
│   ├── ledger-core/            # Pure TypeScript ledger engine (BigInt, Invariants)
│   ├── uae-tax-engine/         # Versioned, data-driven VAT/CT/QFZP rules
│   ├── shared-types/           # Shared DTOs, schemas, enums
│   └── ubl-pinta-generator/    # OASIS UBL 2.1 PINT-AE XML generator
├── services/
│   └── ai-service/             # Python FastAPI service
│       ├── app/
│       │   ├── ocr/            # Arabic/English invoice extractor
│       │   ├── revrec_nlp/     # IFRS 15 contract parser
│       │   ├── monitors/       # Continuous AI anomaly scanners
│       │   └── evals/          # Automated golden dataset evals
│       ├── tests/
│       └── requirements.txt
├── docker/                     # Docker Compose and Dockerfiles
├── infra/                      # Terraform configs for UAE cloud deployment
└── docs/                       # Architecture, PRD, ADRs, Threat Model
```

---

## 2. Event Sourcing & Perpetual Double-Entry Model

All ledger postings are handled through an append-only event stream:

```mermaid
sequenceDiagram
    autonumber
    actor User as Accountant / Agent
    participant API as Ledger API Service
    participant Invariant as Ledger Core (Invariants)
    participant DB as PostgreSQL (RLS & Table Partition)
    participant Temporal as Temporal Workflow
    participant Search as OpenSearch

    User->>API: Post Journal Entry Proposal
    API->>Invariant: Validate Balance (Debits == Credits, Base & Txn)
    Invariant->>Invariant: Verify Period Status (Open & Unlocked)
    Invariant-->>API: Validated (BigInt Minor Units)
    API->>DB: INSERT INTO journal_entries & journal_lines (Immutable)
    API->>DB: UPDATE account_period_balances (Snapshot Rollup)
    API->>Temporal: Dispatch JournalEntryPostedEvent
    Temporal->>Search: Index voucher for drill-down search
    Temporal->>API: Trigger Continuous AI Anomaly Monitor
    API-->>User: Entry Confirmed (Voucher ID, Ledger Sequence No)
```

---

## 3. Data Flow for UAE Peppol E-Invoicing (PINT-AE)

```mermaid
sequenceDiagram
    autonumber
    actor Fin as AR Team / Billing Agent
    participant InvModule as E-Invoicing Module
    participant TaxEngine as UAE Tax Rules Engine
    participant UBLGen as PINT-AE UBL XML Builder
    participant ASP as Accredited Service Provider (ASP)
    participant Archive as S3 Immutable Archive

    Fin->>InvModule: Issue Tax Invoice
    InvModule->>TaxEngine: Validate TRN, VAT Category, Exemption Code
    TaxEngine-->>InvModule: Compliance Validated
    InvModule->>UBLGen: Generate UBL 2.1 XML (PINT-AE Profile)
    UBLGen->>UBLGen: Schematron & Syntax Cryptographic Validation
    InvModule->>ASP: Send Invoice Envelope via Secure Mutual TLS
    ASP-->>InvModule: Return Peppol MLS (Message Level Response: Accepted)
    InvModule->>Archive: Store Signed XML & Cryptographic Hash (10-Yr Retention)
    InvModule-->>Fin: Invoice Transmitted & Cleared
```

---

## 4. Multi-Tenant Row Level Security (RLS) Strategy

Tenant context is set per database session/transaction:
```sql
-- Enforced via NestJS RLS Interceptor
SET LOCAL app.current_tenant_id = 'ten_uae_12345';
SET LOCAL app.current_user_id = 'usr_cfo_98765';
SET LOCAL app.current_entity_id = 'ent_dubai_001';
```

Every database table contains `tenant_id`, and all Postgres policies enforce:
```sql
CREATE POLICY tenant_isolation_policy ON journal_lines
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```
