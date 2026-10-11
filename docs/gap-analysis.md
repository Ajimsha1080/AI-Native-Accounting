# LedgerAE Production Gap Analysis: Prototype to Real Multi-Tenant SaaS

**Date**: 2026-10-11  
**Author**: Principal Engineer / Architect  
**Repo**: `LedgerAE` (`AI-Native-Accounting`)  
**Objective**: Comprehensive catalog of all mock, hardcoded, in-memory, simulated, floating-point, and unverified components across the entire repository, followed by a phased production transformation roadmap.

---

## 1. Executive Summary & Architecture Reality Check

LedgerAE currently possesses a well-structured domain core with strong double-entry accounting models, strict integer minor-unit math (`roundHalfEven`, `CURRENCY_DECIMALS`, `BigInt` fils), versioned UAE tax rules, and a clean bilingual Next.js App Router UI.

However, **it is fundamentally an in-memory prototype**:
1. **Zero Database Persistence**: All database interactions are simulated in memory or via mock classes (`MockPostgresSession`, in-memory `let` arrays in route handlers, `idempotencyCache: Map`). A target schema exists (`packages/shared-types/src/schema.sql`), but no migration runner, ORM/query builder, connection pool, or live RLS enforcement is in place.
2. **Simulated Authentication & RBAC**: Login accepts hardcoded credentials (`accountant@alnoor.ae` / `Password@123`), bypasses real password hashing (no `argon2`), uses hardcoded TOTP bypass (`123456`), and sets static mock session cookies (`sess_jwt_token_verified_active`). No request middleware validates tenant/entity context cryptographically or from a session store.
3. **Simulated AI Intelligence**: `services/ai-service/main.py` uses hardcoded regex parsing and static fallbacks (`Al Futtaim Group LLC`, `confidence_score: 0.96`, `INV-AUTO-PARSED`), completely lacking real Anthropic Claude tool calling, structured Zod/Pydantic validation, or vector RAG.
4. **Duplicate Backends**: Both `apps/api` (a standalone class-based controller) and `apps/web/app/api/*` (Next.js route handlers) implement endpoints, violating the single-backend invariant.
5. **Floating-Point Leaks**: While `packages/ledger-core/src/money.ts` enforces `BigInt`, floats leak in CSV parsing (`parseFloat` in bank statements, document OCR, WPS SIF validation, and report CSV export).
6. **In-Memory Workflow & Agent Runtime**: Month-end close, agent retries, and task execution run on an in-memory scheduler with simulated crash recovery rather than durable orchestrators like Temporal.
7. **Simulated Integrations & MCP Tokens**: Bank feeds (`LeanSandboxAggregatorAdapter`) and ASP e-invoicing (`SandboxAspAdapter`) return static fixtures. MCP write-gating relies on arbitrary string prefixes (`CFO_APPROVED_*`) rather than server-issued, cryptographically signed, single-use approval grants.
8. **Premature Regulatory & Security Claims**: Documentation claims "ASVS Level 2 verified", "reviewed by tax advisor", and "DR restore drill proven" when only unit simulations exist.

---

## 2. File-by-File Gap Analysis

### 2.1. Authentication, Sessions & Credentials
| File | Current Implementation | Production Requirement |
| :--- | :--- | :--- |
| `apps/web/app/api/auth/login/route.ts` | Hardcoded credential check: `email === 'accountant@alnoor.ae' && password === 'Password@123'`. Returns static `tempToken: 'temp_sess_token_2fa_alnoor_881920'`. | Query `users` table via tenant-scoped repository; verify password with `argon2id`; issue signed, short-lived 2FA grant token. |
| `apps/web/app/api/auth/verify-2fa/route.ts` | Hardcoded TOTP check: `code === '123456'`. Sets static cookie `ledger_session = 'sess_jwt_token_verified_active'`. | Encrypted user TOTP secret (AES-GCM); verify standard RFC 6238 TOTP token with replay prevention; issue cryptographically signed JWT or database session. |
| `apps/web/app/[locale]/login/page.tsx` | Default form values prefill `al-noor-group`, `accountant@alnoor.ae`, `Password@123`. | Empty form defaults; strict input validation; rate limiting; lockout on failed attempts. |
| `apps/web/e2e/screen*.spec.ts` (screens 1–9) | Hardcoded test credentials `Password@123` across all Playwright specs. | Seeded dynamic test fixtures in local database. |
| `packages/mcp-server/src/server.ts` | MCP write permission checks `approvalToken.startsWith('CFO_APPROVED_')`. | Server-issued, cryptographically signed (Ed25519 or HMAC SHA-256), expiring, single-use approval tokens recorded in audit logs. |
| `docker-compose.yml` | Hardcoded secrets: `POSTGRES_PASSWORD: secret_local_postgres_password`, `MINIO_ROOT_PASSWORD: minioadminpassword`. | Parameterized via `.env` with strict `.env.example` validation. |

---

### 2.2. In-Memory Data Stores & Simulated Persistence
| File | Current Implementation | Production Requirement |
| :--- | :--- | :--- |
| `apps/web/app/api/ledger/journals/route.ts` | Module-level mutable variable `let JOURNAL_ENTRIES: JournalEntry[] = [...]`. | PostgreSQL `journal_entries` and `journal_lines` tables with transaction isolation and RLS. |
| `apps/web/app/api/ledger/accounts/route.ts` | Module-level `const ACCOUNTS: AccountItem[] = [...]` and in-memory filtering. | PostgreSQL `chart_of_accounts` table queried with `app.current_tenant_id`. |
| `apps/web/app/api/invoicing/route.ts` | Module-level `let INVOICES: InvoiceItem[] = [...]`. | PostgreSQL `invoices`, `invoice_lines`, and `customers` tables. |
| `apps/web/app/api/banking/reconciliation/route.ts` | Module-level `let STATEMENT_LINES`, `let LEDGER_LINES`, `let AI_SUGGESTIONS`. | PostgreSQL `bank_statements`, `bank_statement_lines`, and `reconciliations` tables. |
| `apps/web/app/api/ai/proposals/route.ts` | Module-level `let PROPOSALS: AiProposalItem[] = [...]`. | PostgreSQL `ai_proposals` and `ai_action_logs` tables. |
| `apps/web/app/api/close/route.ts` | Module-level `let CLOSE_STEPS`, `let AUDIT_LOGS`, `const ROLES`. | PostgreSQL `accounting_periods`, `close_steps`, and immutable `audit_logs` tables. |
| `apps/web/app/api/dashboard/metrics/route.ts` | Simulated metric computations based on request headers `x-role` and `x-entity-id`. | Real aggregation queries against ledger lines for the authenticated session entity. |
| `apps/api/src/controller.ts` | In-memory `idempotencyCache: Map`, `webhookSubscriptions: []`, `dispatchedWebhooks: []`. | Redis/Postgres for idempotency keys, transactional outbox for webhooks. |
| `packages/shared-types/src/rls.test.ts` | `MockPostgresSession` simulating RLS with an in-memory JS array. | Real PostgreSQL integration test suite using Testcontainers. |

---

### 2.3. Floating-Point Money Leaks (`parseFloat`, `Number(on money)`, `.toFixed`)
| File | Line(s) | Current Pattern | Production Requirement |
| :--- | :--- | :--- | :--- |
| `packages/ledger-core/src/bank-statement-parser.ts` | 47, 48, 157, 170, 242 | `parseFloat(inflowStr) * 100`, `parseFloat(outflowStr) * 100` | Parse decimal strings directly to integer minor units via shared `parseDecimalToMinorUnits(str, decimals)`. |
| `packages/ledger-core/src/document-intelligence.ts` | 102, 114 | `parseFloat(cleanNum) * 100`, `parseFloat(cleanVat) * 100` | Direct string decimal parsing to `BigInt` minor units without intermediate float representation. |
| `packages/ledger-core/src/ifrs16-lease.ts` | 73, 84 | `Number(input.monthlyPaymentFils) * discountFactor * 10000` | Exact fixed-point math using scaled integer basis points or rational arithmetic. |
| `packages/uae-tax-engine/src/wps-sif.ts` | 132, 173, 174, 187, 189 | `parseFloat(headerParts[5])`, `parseFloat(parts[7])`, `.toFixed(2)` | Parse salary amounts as integer fils (`BigInt`); validate exact integer equality. |
| `packages/ubl-pinta-generator/src/generator.ts` | 193, 196 | `parseFloat(payableMatch[1]) * 100`, `parseFloat(vatMatch[1]) * 100` | Parse XML monetary strings using integer decimal parser. |
| `apps/web/app/[locale]/app/reports/page.tsx` | 105 | `(Number(l.debitMinorUnits)/100).toFixed(2)` | Use `formatMoney(l.debitMinorUnits, 'AED')` from shared money module. |

---

### 2.4. AI Intelligence & Document Extraction
| File | Current Implementation | Production Requirement |
| :--- | :--- | :--- |
| `services/ai-service/main.py` | Hardcoded regex matching: static vendor fallback (`Al Futtaim Group LLC` / `Etisalat UAE`), fixed confidence `0.96`, synthetic single line item generation. | Call Anthropic Claude API (tool use / structured output) with current configured model; unknown fields remain `null`; return explicit extraction tokens and schema validation. |
| `packages/ledger-core/src/document-intelligence.ts` | Regex heuristics matching vendor names and dates with fallback `'2026-03-01'`. | Replace heuristics with LLM extraction pipeline validated with Zod; prompt evals on labelled dataset. |
| `packages/ledger-core/src/assistant.ts` | Regex pattern matching for questions like `"what is our cash"` with hardcoded answers. | Query router using typed domain tools (Trial Balance tool, VAT tool, Ageing tool); cite source entry IDs; vector RAG for policy docs. |

---

### 2.5. Workflows, Integrations & Disaster Recovery Simulations
| File | Current Implementation | Production Requirement |
| :--- | :--- | :--- |
| `packages/ledger-core/src/agent-runtime.ts` | In-memory loop with simulated crash recovery flag (`shouldSimulateCrash`). | Real Temporal SDK workflow definitions, activity definitions, durable timers, and retry policies. |
| `packages/ledger-core/src/bank-feed-aggregator.ts` | `mockAccounts` and `mockTransactions` arrays. Dummy HMAC check: `signature.length > 0 && secret.length > 0`. | Real bank aggregator sandbox client (e.g., Lean / Tarabut); real HMAC SHA-256 signature verification. |
| `packages/ubl-pinta-generator/src/asp-adapter.ts` | `SandboxAspAdapter` with in-memory clearance reference generator `FTA-CLEARANCE-UUID-...` and `simulateNetworkFailure` boolean flag. | Real accredited service provider (ASP) sandbox client contract. |
| `packages/ledger-core/src/security-hardening.ts` | `DisasterRecoveryEngine.runSimulatedRestoreDrill` computing arithmetic difference between mock timestamps. | Real automated backup and restore script with actual PostgreSQL dump/WAL replay drill. |

---

### 2.6. Documentation & Regulatory Claims Hygiene
| File | Inaccurate Claim / Tone | Correction Required |
| :--- | :--- | :--- |
| `README.md` (lines 5, 94-106) | "Security Standard: OWASP ASVS Level 2, SOC 2 Type II / ISO 27001 Ready", "reviewed by tax advisor", "ASVS audit checklist signed off". | Reframe accurately: "Designed for OWASP ASVS Level 2 principles; regulatory rules mapped to official UAE legislation (VERIFY WITH UAE TAX ADVISOR before official filing); pilot prototype ready for staging hardening." |
| `docs/ga-release-pilot-checklist.md` | "Lead Auditor / Principal Architect: Antigravity Principal Engineering & UAE Tax Advisory Practice", checks marked `[x]` as GA verified. | Explicitly note this as a release template checklist, not an external third-party audit certification. |
| `docs/open-questions.md` | Lists open regulatory and vendor questions. | Maintain as active source of truth; link every unresolved edge case to test suites. |

---

## 3. Architecture Decision Records (ADRs) to Establish

1. **ADR 0017: Single Backend Architecture (Next.js Route Handlers vs NestJS)**
   - **Decision**: Designate **Next.js Route Handlers (`apps/web/app/api/*`)** as the single unified backend for LedgerAE.
   - **Rationale**: Next.js App Router already hosts all 9 localized screens and 12 API route handlers. Decommission and remove `apps/api` (the 3-file NestJS skeleton). All Next.js route handlers will delegate directly to shared domain packages (`packages/ledger-core`, `packages/uae-tax-engine`, `packages/persistence`).
2. **ADR 0018: Strict Integer Minor Units & Zero-Float Invariant**
   - Centralize decimal parsing in `packages/ledger-core/src/money.ts` (`parseDecimalToMinorUnits`).
   - Introduce custom ESLint rule banning `parseFloat`, `Number(`, and `.toFixed` on monetary variables.
3. **ADR 0019: Persistence & Multi-Tenant Row Level Security Architecture**
   - Use Kysely / Drizzle with PostgreSQL 16+.
   - Every connection executes `SET LOCAL app.current_tenant_id = $1` within a transaction before querying.
   - Non-superuser role with `FORCE ROW LEVEL SECURITY`.
4. **ADR 0020: AI Document Extraction and Agent Architecture**
   - Sunset the Python FastAPI stub in favor of TypeScript Anthropic Claude SDK with tool calling, Zod structured outputs, and pgvector for document embeddings.

---

## 4. Phase-by-Phase Production Roadmap

### Phase 0: Truth, Hygiene & CI Pipeline
- **Scope**:
  - Remove all committed `.tsbuildinfo` and `.pyc` files.
  - Update `.gitignore` to prevent any build cache, bytecode, or local artifacts from entering git.
  - Correct `README.md` to truthfully reflect prototype vs production state, removing premature claims of external audits or certifications.
  - Add `.env.example` defining all required configuration variables.
  - Update `docker-compose.yml` to consume environment variables instead of hardcoded passwords.
  - Add GitHub Actions CI workflow (`.github/workflows/ci.yml`) covering: install, build, typecheck, lint, unit tests, Playwright E2E, secret scanning (TruffleHog/GitLeaks), and dependency audit (`npm audit`).
- **Definition of Done (DoD)**:
  - Clean git status with no tracked `.tsbuildinfo` or `.pyc`.
  - CI workflow file passes local lint/syntax checks.
  - `npm run build`, `npm run typecheck`, `npm test` execute with 0 errors.

### Phase 1: Persistence & Multi-Tenant Database Layer
- **Scope**:
  - Build migration pipeline (PostgreSQL 16) extending `schema.sql`: tenants, entities, users, accounts, books, periods, journals, lines, audit logs, invoices, bills, vendors, customers, payments, bank statements, bank lines, reconciliations, VAT returns, e-invoices, ASP messages, AI proposals, AI action logs, workflow runs, fixed assets, leases, contracts, rev-rec schedules, payroll, documents, and outbox events.
  - Implement repository layer in `packages/persistence`.
  - Enforce `SET LOCAL app.current_tenant_id = :tenantId` with `FORCE ROW LEVEL SECURITY`.
  - Connect application via non-superuser database role.
- **Definition of Done (DoD)**:
  - Cross-tenant isolation integration tests pass against a real PostgreSQL instance (via Testcontainers or local Postgres).
  - All module-level data stores (`let INVOICES`, `let JOURNAL_ENTRIES`, etc.) replaced by repository queries.

### Phase 2: Authentication, Sessions & RBAC
- **Scope**:
  - Implement real user authentication with `argon2id` password hashing.
  - Implement RFC 6238 TOTP with encrypted secrets (AES-256-GCM) and one-time recovery codes.
  - Implement signed JWT sessions or database session store with rotation, expiration, and revocation.
  - Add rate limiting and account lockout after repeated failed attempts.
  - Implement `withAuth(permission)` wrapper and middleware on EVERY route handler; tenant and entity context extracted exclusively from the validated session.
  - Remove hardcoded credentials (`accountant@alnoor.ae`, `Password@123`, `123456`).
- **Definition of Done (DoD)**:
  - Unauthenticated, expired, or cross-tenant requests return 401/403.
  - RBAC and segregation-of-duties tests pass (e.g. Creator cannot Approve own journal).

### Phase 3: Single Source of Truth & Route Rewiring
- **Scope**:
  - Retire and delete `apps/api`.
  - Rewire every Next.js route handler to call shared domain services and database repositories.
  - Journal postings strictly enforce `validateLedgerInvariants`, period locks, append-only triggers, and SHA-256 hash chains.
  - Form VAT 201 generated dynamically from ledger lines via `calculateVat201Return`, retaining voucher drill-down lineage.
- **Definition of Done (DoD)**:
  - UI numbers match ledger-core outputs in integration tests with 0 fils variance.
  - No static dummy data remaining in any API handler.

### Phase 4: Zero-Float Money Architecture & Lint Guardrails
- **Scope**:
  - Implement `parseDecimalToMinorUnits(value: string, decimals: number): bigint` in `packages/ledger-core/src/money.ts`.
  - Eliminate all `parseFloat`, `Number(money)`, and `.toFixed` from `bank-statement-parser.ts`, `document-intelligence.ts`, `ifrs16-lease.ts`, `wps-sif.ts`, `ubl-pinta-generator`, and web CSV export.
  - Implement fast-check property tests for round-trip parsing, formatting, and Banker's Rounding across arbitrary decimal inputs.
  - Add an ESLint rule / script banning floating-point money operations across the monorepo.
- **Definition of Done (DoD)**:
  - 10,000-iteration property tests pass.
  - ESLint money rule passes on all packages.

### Phase 5: Real AI & Document Intelligence
- **Scope**:
  - Replace regex extraction with Anthropic Claude SDK (tool use / structured output via Zod).
  - Model IDs parameterized via environment configuration.
  - Unknown or ambiguous fields remain `null` and route to human review inbox.
  - Implement eval suite on a labelled bilingual UAE dataset (25+ invoices) verifying accuracy thresholds in CI.
  - Implement Accounting Assistant with typed read-only domain tools and cited ledger voucher IDs.
  - Add pgvector embeddings for contract and guidance RAG.
  - Retire `services/ai-service` via ADR 0020.
- **Definition of Done (DoD)**:
  - AI extraction tests pass with zero numerical hallucination; unknown fields route to approval.
  - All AI token usages and costs logged to `ai_action_logs`.

### Phase 6: Durable Workflows & Outbox
- **Scope**:
  - Implement Temporal workflows for month-end close checklist, recurring accruals, e-invoice ASP retries, and bank feed sync.
  - Replace in-memory `agent-runtime.ts` with Temporal workers and activities.
  - Implement transactional outbox pattern in PostgreSQL for event delivery and webhooks.
  - Deliver webhooks with HMAC-SHA256 signatures, exponential backoff, and dead-letter queues.
- **Definition of Done (DoD)**:
  - Temporal workflows recover state across worker restarts without duplicate ledger side effects.
  - Outbox dispatch tests verify at-least-once delivery with idempotency.

### Phase 7: Real Integrations & Contract Tests
- **Scope**:
  - Accredited Service Provider (ASP) integration with real sandbox credentials for UAE Peppol PINT-AE.
  - Open Banking aggregator integration (Lean Technologies / Tarabut Gateway sandbox).
  - Stripe integration for billing and card payments.
  - Strict contract tests with recorded network fixtures (MSW / VCR).
- **Definition of Done (DoD)**:
  - Sandbox contract tests pass against real external API specifications.
  - Network timeouts and error codes handled gracefully with circuit breakers.

### Phase 8: Hardened Model Context Protocol (MCP) Server
- **Scope**:
  - Adopt official `@modelcontextprotocol/sdk`.
  - Scoped API tokens and OAuth client credentials.
  - Write tools create unposted proposals only; posting requires a server-issued, cryptographically signed, single-use, expiring approval token recorded in the audit log.
  - Remove all prefix-string token checks (`CFO_APPROVED_*`).
- **Definition of Done (DoD)**:
  - Unauthorized or forged approval tokens are rejected.
  - Audit log captures full MCP session, tool inputs, and authorizer identity.

### Phase 9: Complete Feature Modules & UI Polish
- **Scope**:
  - Bills & Vendors, Customers & Payments, 3-Tier Approvals.
  - Multi-Entity Consolidation & Multi-Book reporting with saved views and Excel/PDF export.
  - Fixed Assets, IFRS 15, and IFRS 16 screens.
  - Payroll & Central Bank WPS SIF generation/validation.
  - E-Invoice status and failure queue.
  - Audit log viewer and RBAC settings.
  - Onboarding migration wizard (Zoho Books / QuickBooks / Tally XML import).
  - Auditor read-only workspace, ops console, and sandbox tenants.
- **Definition of Done (DoD)**:
  - All 9 UI screens and new modules fully functional against real database.
  - Playwright E2E passes in both English and Arabic RTL.

### Phase 10: Production Readiness, Infrastructure & Operations
- **Scope**:
  - Production multi-stage Dockerfiles for web, workers, and migration runner.
  - Terraform for UAE region (`me-central-1`) and Kubernetes manifests.
  - Secrets management (AWS Secrets Manager / Vault).
  - OpenTelemetry tracing and Sentry error monitoring.
  - Automated PostgreSQL backup and verifiable PITR restore drill script.
  - Performance load test: 1M ledger lines in PostgreSQL reporting actual p95 trial balance latency.
  - WCAG 2.1 AA accessibility audit and external penetration testing checklist.
- **Definition of Done (DoD)**:
  - Clean container builds and reproducible local deployment via Docker Compose.
  - Actual restore drill executed and logged.
  - 1M line trial balance p95 under 3.0 seconds.
