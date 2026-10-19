# LedgerAE FastAPI Backend Service

Enterprise Python backend for **LedgerAE** — AI-Native Double-Entry Accounting Platform for UAE Mid-Market Groups.

## Features
- **FastAPI / Python 3.11** with asynchronous PostgreSQL operations via `asyncpg` and SQLAlchemy 2.0.
- **Strict Row-Level Security (RLS)** isolating tenant data using PostgreSQL session settings (`app.current_tenant_id`).
- **Cryptographic Security (OWASP ASVS L2)**: Argon2id password hashing, AES-256-GCM TOTP encryption, signed HMAC-SHA256 JWTs.
- **LiteLLM Universal Multi-Model Gateway**: Claude 3.5 Sonnet, GPT-4o, Gemini 1.5 Pro, and deterministic statutory fallbacks.
- **LangSmith Enterprise Observability**: Native LiteLLM callbacks and `@traceable` audit tracing.
- **Epistemic Memory Engine**: Learned tenant accounting policies and vendor classifications.
- **Multi-Layer Guardrails**: Prompt injection shielding, PII redaction, 0-fils double-entry invariant verification, and CFO HITL approval gates.

## Testing & Quality Assurance
Run the unit and integration test suite:
```bash
.\.venv\Scripts\pytest.exe -v
```
All **47 tests** pass with 100% clean execution.

Run the linter:
```bash
.\.venv\Scripts\ruff.exe check .
```
