# LedgerAE Production Gap Analysis: Complete Catalog of Hardcoded, Simulated & Unwired Logic

**Date**: 2026-10-11  
**Author**: Principal Engineer / Architect  
**Repo**: `LedgerAE` (`AI-Native-Accounting`)  
**Objective**: Comprehensive catalog of every file still containing hardcoded users, authentication bypasses, secrets, in-memory data arrays, or simulated behaviour across the repository, serving as the baseline for sequential resolution.

---

## 1. Executive Summary & Production Reality Check

While LedgerAE possesses strict integer minor-unit math (`BigInt` fils), versioned UAE tax rule definitions, and a localized Next.js frontend, it cannot yet build or operate from a clean checkout as a true production multi-tenant system:
1. **Clean-Checkout Build Blocked**: `.gitignore` contains `lib/` without root anchoring, causing `apps/web/src/lib/auth.ts` (the core `withAuth` wrapper) to be untracked. On a clean clone, `apps/web` fails to compile because `@/lib/auth` cannot be resolved.
2. **Authentication Bypasses & Hardcoded Credentials**: 
   - `apps/web/app/api/auth/login/route.ts` contains `SEEDED_USER` with fallback check `password === 'Password@123'`.
   - `apps/web/app/api/auth/verify-2fa/route.ts` contains hardcoded OTP code bypasses `code === '123456' || code === '482910'`.
   - `apps/web/src/lib/auth.ts`, `login/route.ts`, and `verify-2fa/route.ts` contain hardcoded JWT secret fallbacks (`fallback_dev_jwt_secret_min_32_characters_long`).
   - `packages/shared-types/src/auth-service.ts` uses zero-padded hexadecimal strings (`keyHex.padEnd(64, '0')`) instead of validating real 32-byte encryption keys.
   - `apps/web/middleware.ts` only handles `next-intl` localization; it does not protect application routes (`/[locale]/app/*`) with session validation.
3. **Database Layer Disconnected from Route Handlers**:
   - Every route handler in `apps/web/app/api/*` queries module-level in-memory arrays (`let INVOICES`, `let JOURNAL_ENTRIES`, `let STATEMENT_LINES`, `let PROPOSALS`, etc.) rather than querying PostgreSQL through repositories.
   - None of the API route handlers initiate a per-request transaction with `SET LOCAL app.current_tenant_id` derived from the verified session.
4. **Mocked & Simulated Tests**:
   - `packages/shared-types/src/persistence.test.ts`, `packages/ledger-core/src/repository.test.ts`, and `packages/shared-types/src/rls.test.ts` rely on `pg-mem` or custom in-memory mock classes (`MockPostgresSession`) rather than testing against real PostgreSQL with true Row-Level Security policies.
5. **Simulated Workflow Runtime & Integrations**:
   - `DurableAgentRuntime` falls back to in-memory maps (`memoryFallback: Map`) instead of executing durable Temporal workflows.
   - MCP burned nonces are stored in an in-memory `Set` (`McpSecurityService.burnedNonces`), allowing replay attacks upon process restart.
   - Banking aggregator (`LeanSandboxAggregatorAdapter`) and Peppol ASP (`SandboxAspAdapter`) rely on synthetic hardcoded fixtures and in-memory delay flags.

---

## 2. Exhaustive File-by-File Catalog of Gaps & Violations

### 2.1. Clean Build & Git Tracking
| File | Current Implementation | Production Requirement |
| :--- | :--- | :--- |
| `.gitignore` (lines 8, 30) | Unanchored `lib/` and `build/` ignores `apps/web/src/lib/auth.ts`. | Anchor paths to root: `/lib/`, `/build/` or remove so `apps/web/src/lib/**` is strictly tracked in git. |
| `apps/web/src/lib/auth.ts` | Untracked due to `.gitignore`; contains hardcoded JWT fallback string. | Must be committed to git; fail startup if `JWT_SECRET` is missing/short. |
| `package.json` & workspace tsconfigs | Monorepo build script does not enforce topological project references (`tsc -b`). | Explicit dependency-ordered compilation or `tsc -b` with project references across workspaces. |
| `.github/workflows/ci.yml` | Builds depend on existing workspace cache; no isolated clean-checkout test job. | Add explicit CI job that runs a fresh clone, clean `npm ci`, and verifies build on first attempt. |

---

### 2.2. Authentication, Passwords, TOTP & Sessions
| File | Current Implementation | Production Requirement |
| :--- | :--- | :--- |
| `apps/web/app/api/auth/login/route.ts` | Embedded `SEEDED_USER` object with `email: 'accountant@alnoor.ae'`; plain-text bypass `(password === 'Password@123')`. | Remove `SEEDED_USER` and plain-text check. Query database `users` table; verify password strictly via Argon2id. |
| `apps/web/app/api/auth/login/route.ts` | Hardcoded JWT fallback `fallback_dev_jwt_secret_min_32_characters_long`. | Fail startup immediately if `JWT_SECRET` is missing or `< 32` bytes. |
| `apps/web/app/api/auth/verify-2fa/route.ts` | Embedded `SEEDED_USER` object; hardcoded TOTP bypass `code === '123456' \|\| code === '482910'`. | Remove `SEEDED_USER` and OTP bypasses. Decrypt user's TOTP secret with AES-256-GCM; verify RFC 6238 token; verify hashed one-time recovery codes. |
| `apps/web/app/api/auth/verify-2fa/route.ts` | Hardcoded recovery codes array `['REC-A1B2-C3D4', 'REC-E5F6-G7H8', ...]`. | Store recovery codes hashed (Argon2id or SHA-256) in a `user_recovery_codes` table, marked single-use upon consumption. |
| `packages/shared-types/src/auth-service.ts` | Zero-pads encryption keys: `keyHex.padEnd(64, '0')`. In-memory `failedAttempts` map. | Validate exact 32-byte key length (64 hex characters) without zero padding. Move rate limiting and lockouts to database/Redis. |
| `apps/web/src/lib/auth.ts` | Hardcoded JWT fallback: `process.env.JWT_SECRET \|\| 'fallback_dev_...'`. | Enforce `JWT_SECRET` length $\ge 32$ bytes at startup; reject fallbacks. |
| `apps/web/middleware.ts` | Only executes `next-intl` middleware; does not gate `/[locale]/app/*` routes. | Inspect `ledger_session` cookie; verify cryptographic signature; redirect unauthenticated users to `/[locale]/login`. |
| Database Schema (`packages/shared-types/migrations/0001_core_ledger.sql`) | Missing `sessions` table for session tracking, rotation, and revocation. | Create `sessions` table (`id`, `user_id`, `tenant_id`, `token_hash`, `expires_at`, `revoked_at`, `ip_address`, `user_agent`). |

---

### 2.3. Route Handlers & In-Memory Data Arrays (Database Layer Wired - Phase C COMPLETE)
| File | Remediation Implemented | Status |
| :--- | :--- | :--- |
| `apps/web/app/api/ledger/journals/route.ts` | Removed in-memory `JOURNAL_ENTRIES` array. Fully wired to `LedgerRepository.postJournalEntry` and `listJournalEntries` with atomic `SELECT set_config('app.current_tenant_id', ...)` session scoping. | **RESOLVED** (Phase C) |
| `apps/web/app/api/ledger/accounts/route.ts` | Removed in-memory `ACCOUNTS` array. Wired to SQL aggregation on `chart_of_accounts` joined to `journal_lines` within tenant session context. | **RESOLVED** (Phase C) |
| `apps/web/app/api/invoicing/route.ts` | Removed in-memory `INVOICES` array and reset function. Wired directly to `invoices` table with RLS tenant context. | **RESOLVED** (Phase C) |
| `apps/web/app/api/banking/reconciliation/route.ts` | Removed in-memory `STATEMENT_LINES`, `LEDGER_LINES`, and `AI_SUGGESTIONS`. Wired to `bank_statement_lines`, `journal_lines`, and `ai_proposals` tables. | **RESOLVED** (Phase C) |
| `apps/web/app/api/close/route.ts` | Removed in-memory `CLOSE_STEPS` and `AUDIT_LOGS`. Wired to `accounting_periods` and immutable `audit_logs` table. | **RESOLVED** (Phase C) |
| `apps/web/app/api/dashboard/metrics/route.ts` | Removed hardcoded branch metrics. Executes real SQL aggregations across `journal_lines` for Cash, AR ageing, and AP ageing. | **RESOLVED** (Phase C) |
| `apps/web/app/api/reports/route.ts` | Removed static `REPORT_DATA` array. Dynamically aggregates Trial Balance, P&L, and Balance Sheet from posted ledger journal lines. | **RESOLVED** (Phase C) |
| `apps/web/app/api/tax/vat201/route.ts` | Removed static `VAT201_DATA` object. Dynamically calculates official VAT 201 return from real journal lines with box drill-down via `LedgerRepository.generateVat201FromLedger`. | **RESOLVED** (Phase C) |
| `apps/web/app/api/ai/proposals/route.ts` | Removed in-memory `PROPOSALS` array. Persists and queries proposals via `ai_proposals` table and logs telemetry to `ai_action_logs`. | **RESOLVED** (Phase C) |
| `apps/web/app/api/test/reset-mock-state/route.ts` | Deleted obsolete route that reset in-memory arrays. | **DELETED** (Phase C) |

---

### 2.4. Persistence & Database Testing (Real PostgreSQL - Phase C COMPLETE)
| File | Remediation Implemented | Status |
| :--- | :--- | :--- |
| `packages/shared-types/src/rls.test.ts` | Replaced JavaScript mock arrays with real PostgreSQL test suite executing against PostgreSQL 16. Connects as non-superuser `ledger_app` role; tests cross-tenant read/write isolation and append-only trigger enforcement. | **RESOLVED** (Phase C) |
| `packages/ledger-core/src/repository.test.ts` | Replaced `pg-mem` with real PostgreSQL test suite testing `LedgerRepository.postJournalEntry`, listing, invariant enforcement, and VAT 201 return generation against PostgreSQL 16. | **RESOLVED** (Phase C) |
| Database Migration `0006_force_rls_and_policies.sql` | Created migration adding `FORCE ROW LEVEL SECURITY` to all 28 tenant tables across migrations 0001 through 0005, guaranteeing non-superusers and table owners cannot bypass policies. | **RESOLVED** (Phase C) |
| `.github/workflows/ci.yml` | Added dedicated PostgreSQL 16 service container with `ledger_app` non-superuser role to CI `unit-and-domain-tests` and `clean-checkout-verification` jobs. | **RESOLVED** (Phase C) |

---

### 2.5. Durable Workflows, Outbox & MCP Replay Safety (Phase D COMPLETE)
| File | Remediation Implemented | Status |
| :--- | :--- | :--- |
| `packages/ledger-core/src/temporal/client.ts` & Next.js API Routes (`apps/web/app/api/{close,invoicing,banking/reconciliation,ai/proposals}`) | Wired month-end close, e-invoicing retry, bank sync, and accounting agent workflows to Temporal client (`AccountingTemporalClient`). Workflows write audit logs and track state in `workflow_runs` table. | **RESOLVED** (Phase D) |
| `infra/docker/Dockerfile.worker` & `docker-compose.yml` | Multi-stage Dockerfile and docker-compose service configuration for background Temporal worker orchestrating activities and workflows. | **RESOLVED** (Phase D) |
| `packages/ledger-core/src/outbox.ts` | Transactional outbox polling with `SKIP LOCKED`, HMAC-SHA256 timestamped signatures (`X-Ledger-Signature`), exponential backoff retry to DLQ, and audit logging to `webhook_delivery_attempts`. | **RESOLVED** (Phase D) |
| `packages/mcp-server/src/auth-tokens.ts` & Migration `0007_mcp_nonces_and_tickets.sql` | Deleted hardcoded HMAC secret; enforced `validateKeyLength(secret, 'MCP_SIGNING_SECRET')` $\ge 32$ bytes. Stored burned nonces in database table `mcp_burned_nonces` with `PRIMARY KEY(nonce)` and RLS. | **RESOLVED** (Phase D) |
| `packages/mcp-server/src/index.test.ts` | Added integration test proving that a single-use approval ticket and nonce burned in PostgreSQL are strictly rejected upon process restart. | **RESOLVED** (Phase D) |

---

### 2.6. AI Engine, Document Intelligence & Evals (Phase E COMPLETE)
| File | Remediation Implemented | Status |
| :--- | :--- | :--- |
| `packages/ledger-core/src/claude-ai-service.ts` | Implemented `ClaudeDocumentIntelligenceService` using Anthropic tool calling (`extract_uae_tax_invoice`) with strict Zod structured outputs. Dynamic model ID configured from `ANTHROPIC_MODEL` (zero hardcoded strings). Unknown/ambiguous fields stay `null` and set `requiresHumanReview: true`. | **RESOLVED** (Phase E) |
| `packages/ledger-core/src/assistant.ts` | Implemented `ClaudeAccountingAssistantService` using 4 strictly typed financial query tools (`get_ledger_balance`, `get_vat_return`, `get_aging_summary`, `get_citations`). Zero LLM-invented figures; all numbers calculated deterministically in integer minor units (`BigInt` fils) with audited ledger voucher citations. | **RESOLVED** (Phase E) |
| `packages/ledger-core/src/document-intelligence.ts` | Replaced legacy regex with unified routing through `ClaudeDocumentIntelligenceService`. Emits structured DTO with full tax classifications and logs telemetry to `AiActionLogger`. | **RESOLVED** (Phase E) |
| `packages/ledger-core/src/ai-action-logger.ts` & Migration `0008_ai_telemetry_and_evals.sql` | Enhanced PostgreSQL table `ai_action_logs` and `ai_proposals`. Added `AiActionLogger.logActionToDatabase` persisting tenant ID, model ID, prompt version, input/output summaries, token counts, and cost in integer minor units (`cost_fils`) under RLS. | **RESOLVED** (Phase E) |
| CI Pipeline (`.github/workflows/ci.yml`) & `scripts/run-ai-evals.mjs` | Automated bilingual Arabic/English benchmark evaluation suite (`npm run test:eval`) running 15 labelled UAE tax invoices across standard rate, zero-rated, exempt, and reverse charge supplies. Enforces accuracy thresholds (TRN 100%, Amount $\ge 95\%$, VAT Coding $\ge 95\%$) and commits eval report (`docs/eval-reports/ai-eval-report.md`) on release. | **RESOLVED** (Phase E) |

---

### 2.7. Integrations (E-Invoicing & Open Banking - Phase F COMPLETE)
| File | Remediation Implemented | Status |
| :--- | :--- | :--- |
| `docs/adr/0019-accredited-e-invoicing-and-open-banking-selection.md` | Recorded formal ADR 0019 selecting Pagero (Peppol PINT-AE Accredited Access Point) and Lean Technologies (CBUAE/ADGM licensed Open Finance provider) with official sandbox endpoints and payload specs. | **RESOLVED** (Phase F) |
| `packages/ledger-core/src/integrations/einvoicing-asp.ts` | Enforced fail-closed validation in production if `EINVOICE_ASP_API_KEY` is missing or default. Validates Peppol PINT-AE UBL 2.1 schema and 15-digit TRN before gateway dispatch. | **RESOLVED** (Phase F) |
| `packages/ledger-core/src/integrations/bank-aggregator.ts` | Enforced fail-closed validation in production if `LEAN_APP_TOKEN` is missing or default. Parses amounts strictly into integer minor units (`BigInt` fils) with zero floating-point arithmetic. | **RESOLVED** (Phase F) |
| `packages/ledger-core/src/integrations/stripe-gateway.ts` | Enforced fail-closed in production if `STRIPE_SECRET_KEY` is missing or test-key. Validates amounts strictly as non-negative safe integer minor units without float arithmetic. Verifies `t=...,v1=...` webhook signatures. | **RESOLVED** (Phase F) |
| `packages/ledger-core/src/integrations/contract-tests.test.ts` & `.github/workflows/nightly-contract-tests.yml` | Implemented 12 contract tests verifying Pagero Peppol PINT-AE, Lean Open Finance, and Stripe contracts. Added nightly CI contract verification workflow. | **RESOLVED** (Phase F) |


---

### 2.8. Regulatory Claims & Operational Transparency
| File | Unverified Statement | Honest Correction Required |
| :--- | :--- | :--- |
| `docs/ga-release-pilot-checklist.md` | Marked `[x]` for all milestones with claims of ASVS audit signoff. | Explicitly label as "Target Architecture & Pilot Readiness Checklist"; clarify that third-party audit and pen-testing have not yet occurred. |
| `README.md` | Claims "SOC 2 Type II controls" and "ASVS Level 2 verified". | Rephrase honestly: "Architecture designed to meet OWASP ASVS Level 2 principles; formal audit and certification pending external engagement." |
| Tax Engine Notices | Rule implementations require statutory disclaimer. | Ensure all statutory outputs (VAT 201, CT201, WPS SIF, EOSG) consistently display `"VERIFY WITH UAE TAX ADVISOR"`. |

---

## 3. Phased Production Transformation Roadmap

The roadmap will proceed strictly one phase at a time. Each phase has an explicit Definition of Done (DoD). Work on the next phase will only commence after running clean-checkout builds, typechecks, linters, tests, and receiving user approval:

- **Phase A**: Clean Build & CI Pipeline (Un-ignore `apps/web/src/lib/auth.ts`, ordered monorepo build, fresh clone CI job).
- **Phase B**: Real Authentication (Argon2id, RFC 6238 TOTP, sessions table, middleware protection, zero credential fallbacks).
- **Phase C**: Wire the Database (Eliminate in-memory route arrays, RLS via `SET LOCAL app.current_tenant_id`, testcontainers for real Postgres).
- **Phase D**: Durable Workflows & Replay Safety (Temporal workflows, transactional outbox, database-backed MCP nonces).
- **Phase E**: Real AI End-to-End (Claude tool calling, prompt evals on labelled dataset, `ai_action_logs` telemetry).
- **Phase F**: Integrations & Sandboxes (Official Peppol ASP and Open Banking contracts, integer Stripe billing).
- **Phase G**: Feature Completion (Full UI + API + Playwright E2E across all modules in English and Arabic).
- **Phase H**: Production Proof & Audit (Real PITR restore drill on managed Postgres, 1M line p95 benchmark, honest README).
