# ADR 0001: Monorepo Architecture and Technology Stack

## Status
Accepted

## Context
LedgerAE is a production-grade, AI-native ERP specifically tailored for the UAE market (mainland, free zones, ADGM/DIFC). The system requires:
1. Deterministic, audit-compliant double-entry ledger performance.
2. Unified domain models shared across backend services and frontend clients.
3. Python-based AI, OCR, document understanding, and evaluation pipelines.
4. Robust workflow orchestration for month-end close, approvals, and asynchronous document processing.
5. Strict UAE data residency and PDPL compliance.

## Decision
We adopt a structured monorepo architecture:
- **Package Management & Tooling**: `npm` workspaces (native Node.js support) or `pnpm` if installed, with Turborepo or Nx for build caching.
- **Backend Core**: NestJS modular monolith (`apps/api`) in strict TypeScript.
- **Frontend Web**: Next.js App Router (`apps/web`) with Tailwind CSS, Radix UI/shadcn-inspired components, TanStack Table for dense financial grids, full RTL and i18n (`next-intl`).
- **Ledger Engine**: Pure TypeScript domain library (`packages/ledger-core`) implementing an append-only, event-sourced double-entry ledger. All currency amounts are stored as integers (minor currency units) with BigInt math and deterministic rounding (half-even / bankers rounding).
- **Tax & Compliance Engine**: Versioned rules module (`packages/uae-tax-engine`) containing UAE VAT, Corporate Tax (9%), Qualifying Free Zone Person (QFZP) rules, and Peppol PINT-AE data models.
- **AI & OCR Microservices**: Fast-executing Python services (`services/ai-service`) running FastAPI, Anthropic Claude Client, LangChain/LlamaIndex or raw tool harnesses, and PyMuPDF/EasyOCR/Tesseract for Arabic/English OCR.
- **Workflow Orchestration**: Temporal.io for durable workflows (period close checklist, approvals, recurring invoices, AI agent tasks, e-invoicing retry loops).
- **Data Stores**:
  - PostgreSQL 16+ with Row-Level Security (RLS) for tenant isolation, table partitioning for journal entries and audit logs, and `pgvector` for document/books embeddings.
  - Redis for cache, lock management, and session tokens.
  - S3-compatible object storage (e.g., MinIO or AWS S3 me-central-1 UAE region) with SSE-KMS for immutable document archiving.

## Consequences
- **Pros**:
  - Single source of truth for TypeScript types, shared DTOs, and tax validation logic between API and web client.
  - Strict boundary isolation between ledger invariant math and peripheral I/O.
  - Python leverages best-in-class Arabic OCR and LLM evaluation tools while keeping core financial ledger in strictly typed TypeScript.
- **Cons**:
  - Dual-runtime deployment (Node.js/TypeScript and Python).
  - Requires Docker Compose / Kubernetes setups to manage PostgreSQL, Redis, and Temporal dependencies in development.
