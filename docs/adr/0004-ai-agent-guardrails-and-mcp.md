# ADR 0004: AI Agent Architecture, Guardrails, Deterministic Queries, and Model Context Protocol (MCP)

## Status
Accepted

## Context
AI-native ERPs require LLM capabilities for continuous anomaly detection, document extraction (OCR/invoices), natural language querying over the books, and autonomous month-end close workflows. However, in financial and regulatory reporting:
1. Hallucinations in financial values are catastrophic.
2. Direct, unverified database modifications by autonomous agents violate Sarbanes-Oxley / UAE audit segregation of duties.
3. Sensitive customer financial books must strictly comply with UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021) and tenant data privacy.

## Decision
1. **Accounting Logic First, LLM Second (Deterministic Execution)**:
   - The LLM never computes or fabricates financial balances. All numerical reporting queries are generated as structured, parameterized queries against deterministic read models/APIs.
   - The LLM only interprets natural language, formulates the query parameters, and explains the resulting deterministic numbers with linked journal entry citations.

2. **Proposals & Approval Guardrails**:
   - AI agents (e.g. Accruals Agent, Bill Extraction Agent, Reconciliation Agent) **never post directly** to the general ledger.
   - Agents output immutable `DraftProposal` objects with confidence scores, cited source documents, and detailed accounting rationale.
   - Humans review and approve proposals via UI workflows. Configurable auto-approval is permissible only for explicitly authorized low-risk rules with threshold limits (e.g. recurring utility bills matching previous month within 2% variance up to AED 1,000).

3. **Temporal Durable Execution**:
   - Long-running multi-step agents execute as durable Temporal workflows. Every API call, LLM prompt, and tool execution is recorded in an audit trail with token costs, model version, prompt hash, and user context.

4. **Model Context Protocol (MCP) Server**:
   - Expose a secure MCP server (`packages/mcp-server`) that enables approved external LLM clients (e.g. Claude Desktop, Antigravity) to query LedgerAE.
   - Default permissions are strictly read-only. Write operations require explicit dual-control human approval tokens.

5. **Tenant Isolation & Zero Training**:
   - Zero retention/training agreements with foundation model providers (Anthropic). No cross-tenant data sharing. Per-tenant pgvector indexing for RAG.

## Consequences
- Guarantees 100% mathematical integrity and strict regulatory compliance.
- Transparent explainability for all automated postings.
