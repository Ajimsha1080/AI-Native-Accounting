# ADR 0018: Sunset Python AI Service in Favor of TypeScript Anthropic Claude SDK with Tool Use & Zod Validation

## Status
Accepted

## Date
2026-10-11

## Context
Per Phase 5 requirement:
> "Real AI: replace services/ai-service regex with Claude calls (Anthropic API with tool use, current model IDs from config, not hardcoded). Structured output validated by zod/pydantic; no invented defaults or fixed confidence; unknown fields stay null and route to human review. Evals on a labelled Arabic/English invoice set; CI blocks regressions. Assistant answers use typed query tools only, with cited source entries. Use pgvector RAG only for contracts, documents and loaded guidance. Decide via ADR whether Python is still needed; prefer TypeScript."

In ADR 0001 and 0005, a separate Python FastAPI service (`services/ai-service`) was provisioned to handle OCR and document parsing with regex and floats. However:
1. Maintaining a second runtime (Python 3.11 + virtual environments + FastAPI + pydantic + uvicorn) alongside the Node.js monorepo creates dual deployment complexity, separate dependency auditing, and duplicated models.
2. The Python stub used floating-point arithmetic (`float` AED) in direct violation of our Zero-Float financial rule.
3. The official Anthropic SDK (`@anthropic-ai/sdk`) in TypeScript provides first-class support for Claude tool use, structured JSON schemas, multimodal image/PDF ingestion, and streaming.
4. Schema validation with Zod in TypeScript guarantees compile-time and runtime type safety matching our existing monorepo data models.

## Decision
1. **Retire and delete `services/ai-service`**: All document intelligence, invoice parsing, and assistant interactions will be handled natively in TypeScript via `@ledger-ae/ledger-core` and `@anthropic-ai/sdk`.
2. **Standardize on Claude 3.5 Sonnet / Haiku**: Model IDs are configured dynamically via environment variables (`ANTHROPIC_MODEL` defaulting to `claude-3-5-sonnet-20241022` or `claude-3-5-haiku-20241022`), never hardcoded.
3. **Structured Outputs via Zod**: Every LLM extraction is validated against strict Zod schemas. Unknown fields remain `null` (never invented defaults or fixed 0.96 confidence). Low confidence or unparseable fields route to human review.
4. **Tool Use for Copilot**: The accounting assistant executes typed query tools (`get_ledger_balance`, `get_vat_return`, `get_aging_summary`, `get_citations`) and must cite real transaction hashes and voucher IDs.

## Consequences
- **Positive**: Single runtime (Node.js/TypeScript); zero Python deployment overhead; strict Zod validation; exact integer minor units; continuous regression CI evals in TypeScript.
- **Negative**: Document parsing requiring on-premise local OCR engines (e.g. Tesseract) will require hosted OCR API or Claude's native multimodal vision capabilities.
