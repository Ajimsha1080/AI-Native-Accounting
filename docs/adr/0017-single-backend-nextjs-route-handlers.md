# ADR 0017: Single Backend Architecture - Standardizing on Next.js Route Handlers & Retiring apps/api

## Status
Accepted

## Date
2026-10-11

## Context
In our working rules, Rule 3 states:
> "One backend only. Decide via ADR whether Next.js route handlers or a NestJS apps/api is the single API; delete the other. All routes must call shared services in packages/*, never contain business data."

The initial prototype repository had both:
1. `apps/web`: A Next.js 16 full-stack application with Route Handlers under `apps/web/app/api/*`, integrated with our frontend screens, internationalization (`/[locale]`), and cryptographic session authentication (`withAuth`).
2. `apps/api`: A minimal TypeScript controller library (`@ledger-ae/api`) mirroring a standalone API service with 3 controller functions, but lacking complete route infrastructure, middleware, session management, or routing tables.

Operating two backend services in parallel creates code duplication, diverged validation logic, split maintenance overhead, and conflicting entry points.

## Decision
We establish **Next.js Route Handlers in `apps/web/app/api/*` as the single, authoritative backend API** for LedgerAE SaaS and decommission `apps/api`.

### Rationale
1. **Single Deployment Unit**: Next.js route handlers run in the exact same Node.js runtime as the UI shell, enabling zero-latency server-side rendering (SSR), unified cookies/session handling (`withAuth`), and simplified UAE cloud deployment (single container or unified ECS/Kubernetes service).
2. **Standardized Middleware & Tenancy Invariant**: `withAuth(permission)` is already built and verified in Next.js route handlers, ensuring tenant and entity are extracted exclusively from the authenticated cryptographic session (Argon2id/TOTP), preventing spoofing via client headers.
3. **Pure Shared Domain Logic**: Next.js route handlers serve strictly as thin transport adapters (HTTP request parsing, auth check, status codes). All business rules, invariants (`validateLedgerInvariants`), double-entry balance checks, tax engine rules (`calculateVat201Return`), and cryptographic voucher hashing (`computeVoucherHash`) remain in shared monorepo packages (`packages/ledger-core`, `packages/uae-tax-engine`, `packages/ubl-pinta-generator`, `packages/shared-types`).
4. **Clean Monorepo Topology**: Eliminating `apps/api` eliminates monorepo build friction, unnecessary duplicate typings, and architectural ambiguity.

## Migration & Decommissioning Plan
1. Ensure all functionality previously hosted in `apps/api/src/controller.ts` (idempotency key cache, webhook dispatch, PINT-AE e-invoice transmission, ledger posting validation) is fully represented in shared packages or `apps/web/app/api/*`.
2. Remove `apps/api` from root `package.json` workspaces.
3. Delete `apps/api/` directory.
4. Rewire all `apps/web/app/api/*` routes to call the pure shared services in `packages/ledger-core`, `packages/uae-tax-engine`, etc.

## Consequences
- **Positive**: Single codebase for API and UI; unified CI build/typecheck/lint pipeline; single source of truth for routing and authorization.
- **Negative**: Long-running background jobs must not run in HTTP route handlers; workflows must use the Temporal worker/activity pattern in Phase 6.
