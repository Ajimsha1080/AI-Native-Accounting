# LedgerAE: Python Backend Migration Plan & Architecture Specification

**Date:** 2026-10-16  
**Status:** In Progress (Phase 1 & 2 Complete)  
**Target Runtime:** Pure Python 3.11/3.12 (FastAPI + SQLAlchemy 2.x asyncpg + Pydantic v2)  
**Frontend Runtime:** TypeScript 5.7+ / React 19 / Next.js 16 App Router (Retained)  

---

## 1. Executive Summary & Objective

In accordance with the Master Implementation Prompt, LedgerAE is migrating all server-side application business logic, accounting rules, double-entry transactional posting, AI agent workflows, statutory tax generation, and MCP endpoints from Next.js API route handlers to a **pure Python FastAPI backend**.

### Core Architecture Principles
1. **Frontend Retained:** Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS v4 are preserved. Next.js will forward `/api/*` traffic via `rewrites()` or explicit proxy to FastAPI.
2. **Pure Python Backend:** All business rules, repositories, domain services, AI orchestration, and database operations execute within `backend/app/`.
3. **Zero Floating-Point Financial Invariant:** Currency amounts are stored and calculated strictly in integer minor units (`fils` in `int`) or `Decimal` with explicit rounding.
4. **PostgreSQL 16 & Forced RLS:** All tenant access enforces `SET LOCAL app.current_tenant_id` within transactional session scopes.
5. **Append-Only Auditability:** SHA-256 hash-chained audit records for financial mutations.

---

## 2. API Endpoint Migration Matrix (24 Routes)

| # | Existing Route & Method | Description & Database Ops | New FastAPI Endpoint | Frontend Call Site | Status |
|---|---|---|---|---|---|
| 1 | `POST /api/auth/login` | Queries `users`, verifies password via Argon2id; returns 2FA challenge | `POST /api/v1/auth/login` | `apps/web/app/[locale]/login/page.tsx` | Planned |
| 2 | `POST /api/auth/verify-2fa` | Decrypts TOTP secret (AES-GCM); verifies RFC 6238; issues JWT cookie | `POST /api/v1/auth/verify-2fa` | `apps/web/app/[locale]/login/page.tsx` | Planned |
| 3 | `POST /api/auth/logout` | Revokes active session in `sessions` table; clears cookie | `POST /api/v1/auth/logout` | `apps/web/src/components/AppShell.tsx` | Planned |
| 4 | `GET /api/dashboard/metrics` | SQL aggregations over `journal_lines` (Cash, AR/AP ageing, proposals) | `GET /api/v1/dashboard/metrics` | `apps/web/app/[locale]/app/dashboard/page.tsx` | Planned |
| 5 | `GET /api/ledger/accounts` | Lists `chart_of_accounts` with real-time debit/credit balances | `GET /api/v1/ledger/accounts` | `apps/web/app/[locale]/app/ledger/accounts/page.tsx` | Planned |
| 6 | `GET, POST /api/ledger/journals` | Atomic double-entry journal posting with balance check and audit trail | `GET, POST /api/v1/ledger/journals` | `apps/web/app/[locale]/app/ledger/journals/page.tsx` | Planned |
| 7 | `GET, POST /api/invoicing` | Sales invoice CRUD, UBL 2.1 data structure, line items in fils | `GET, POST /api/v1/invoicing` | `apps/web/app/[locale]/app/invoicing/sales/page.tsx` | Planned |
| 8 | `GET, POST /api/vendors/bills` | Vendor bills list, 3-way match status, multi-tier approval workflow | `GET, POST /api/v1/vendors/bills` | `apps/web/app/[locale]/app/payables/bills/page.tsx` | Planned |
| 9 | `GET, POST /api/customers/payments` | Receivables list, payment allocation against invoices | `GET, POST /api/v1/customers/payments` | `apps/web/app/[locale]/app/receivables/payments/page.tsx` | Planned |
| 10 | `GET, POST /api/banking/reconciliation` | Bank statement lines, ledger matching, fee journal auto-post | `GET, POST /api/v1/banking/reconciliation` | `apps/web/app/[locale]/app/banking/reconciliation/page.tsx` | Planned |
| 11 | `GET /api/tax/vat201` | Official FTA 14-box VAT 201 return calculation with drill-down lineage | `GET /api/v1/tax/vat201` | `apps/web/app/[locale]/app/tax/vat201/page.tsx` | Planned |
| 12 | `GET, POST /api/ai/proposals` | Autonomous agent proposals inbox, prompt telemetry, approval execution | `GET, POST /api/v1/ai/proposals` | `apps/web/app/[locale]/app/ai/proposals/page.tsx` | Planned |
| 13 | `GET /api/reports` | Trial Balance, Profit & Loss, Balance Sheet generation | `GET /api/v1/reports` | `apps/web/app/[locale]/app/reports/page.tsx` | Planned |
| 14 | `POST /api/reports/builder` | Custom report builder with category grouping and CSV/JSON export | `POST /api/v1/reports/builder` | `apps/web/app/[locale]/app/reports/builder/page.tsx` | Planned |
| 15 | `GET, POST /api/close` | 12-step month-end close checklist, hard-locking accounting periods | `GET, POST /api/v1/close` | `apps/web/app/[locale]/app/close/page.tsx` | Planned |
| 16 | `GET /api/consolidation/multibook` | IFRS 10 multi-entity consolidation with intercompany eliminations | `GET /api/v1/consolidation/multibook` | `apps/web/app/[locale]/app/consolidation/page.tsx` | Planned |
| 17 | `GET, POST /api/assets/fixed` | Fixed asset register, straight-line depreciation schedules | `GET, POST /api/v1/assets/fixed` | `apps/web/app/[locale]/app/assets/page.tsx` | Planned |
| 18 | `GET /api/ifrs/revenue-leases` | IFRS 15 5-step milestone revenue and IFRS 16 lease liability/ROU | `GET /api/v1/ifrs/revenue-leases` | `apps/web/app/[locale]/app/assets/page.tsx` | Planned |
| 19 | `GET, POST /api/payroll/wps` | Employee payroll, EOSG gratuity calculations, CBUAE WPS SIF export | `GET, POST /api/v1/payroll/wps` | `apps/web/app/[locale]/app/payroll/page.tsx` | Planned |
| 20 | `GET, POST /api/einvoicing/queue` | Peppol PINT-AE UBL 2.1 failure queue, dead-letter retry | `GET, POST /api/v1/einvoicing/queue` | `apps/web/app/[locale]/app/einvoicing/page.tsx` | Planned |
| 21 | `GET /api/settings/audit-roles` | Immutable SHA-256 hash-chained audit viewer, RBAC permissions | `GET /api/v1/settings/audit-roles` | `apps/web/app/[locale]/app/audit/page.tsx` | Planned |
| 22 | `POST /api/onboarding/import` | Multi-source migration (Zoho Books, QuickBooks, Tally) | `POST /api/v1/onboarding/import` | `apps/web/app/[locale]/app/onboarding/page.tsx` | Planned |
| 23 | `GET /api/auditor/workspace` | Auditor read-only sandbox, official FTA Audit File (FAF v1.0.0) | `GET /api/v1/auditor/workspace` | `apps/web/app/[locale]/app/auditor/page.tsx` | Planned |
| 24 | `GET, POST /api/ops/console` | Internal ops console, tenant management, subscription billing/metering | `GET, POST /api/v1/ops/console` | `apps/web/app/[locale]/app/ops/page.tsx` | Planned |

---

## 3. Target Python Backend Directory Structure

```
backend/
├── app/
│   ├── main.py                     # FastAPI application factory & lifespan
│   ├── api/
│   │   ├── deps.py                 # FastAPI dependencies (DB session, auth, tenant)
│   │   └── v1/
│   │       ├── router.py           # Master v1 API router
│   │       └── endpoints/          # Modular endpoint handlers (all 24 routes)
│   ├── core/
│   │   ├── config.py               # Pydantic v2 settings (env validation)
│   │   ├── security.py             # Argon2id, AES-256-GCM, RFC 6238 TOTP, JWT
│   │   ├── logging.py              # Structured JSON logging with request IDs
│   │   └── exceptions.py           # Domain & HTTP exception hierarchy
│   ├── db/
│   │   ├── session.py              # Async SQLAlchemy engine & session factory
│   │   └── base.py                 # Declarative base & table metadata
│   ├── models/                     # SQLAlchemy 2.0 ORM models matching migrations 0001-0009
│   ├── schemas/                    # Pydantic v2 request/response DTOs
│   ├── repositories/               # Data access layer with RLS tenant context
│   ├── domain/
│   │   ├── accounting/             # Double-entry ledger invariants, balanced posting
│   │   ├── taxation/               # UAE VAT 201, Corporate Tax Form CT201, FAF
│   │   ├── invoicing/              # Peppol PINT-AE UBL 2.1, 3-way matching
│   │   └── payroll/                # Central Bank WPS SIF, Article 51 EOSG gratuity
│   ├── ai/
│   │   ├── agent.py                # Anthropic Claude SDK with strict tool calling
│   │   └── guardrails.py           # Prompt injection defense, zero-float validation
│   └── mcp/
│       └── server.py               # Python MCP Server implementation
├── tests/
│   ├── unit/                       # Double-entry math, VAT, WPS, TOTP unit tests
│   ├── integration/                # Real PostgreSQL 16 RLS & API integration tests
│   ├── security/                   # Auth bypass, cross-tenant RLS, ticket replay
│   └── conftest.py                 # Test fixtures & live PostgreSQL engine
├── pyproject.toml
├── alembic.ini
└── Dockerfile
```
