# Production Secrets Management Policy & Architecture

**Target System:** LedgerAE Enterprise ERP  
**Standard Compliance:** OWASP ASVS Level 2, UAE PDPL, ISO/IEC 27001  

---

## 1. Secrets Classification & Storage Matrix

All production secrets and sensitive configuration values are categorized and governed according to the following strict policy:

| Secret Category | Examples | Target Vault Service | Rotation Cycle | Enforcement Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication & Tokens** | `JWT_SECRET`<br>`SESSION_ENCRYPTION_KEY` | AWS Secrets Manager / HashiCorp Vault | 90 Days | Application startup validation ($\ge 32$ bytes minimum length; zero fallbacks). |
| **Database Encryption** | `ENCRYPTION_KEY` | Cloud KMS (Envelope Encryption) | 180 Days | AES-256-GCM authenticated cipher with random 12-byte IV per record. |
| **Integration API Keys** | `EINVOICE_ASP_API_KEY`<br>`LEAN_APP_TOKEN`<br>`STRIPE_SECRET_KEY` | AWS Secrets Manager / Azure Key Vault | 90 Days | Fail-closed in production (`NODE_ENV === 'production'`) if missing or set to placeholder. |
| **Internal RPC & MCP** | `MCP_SIGNING_SECRET`<br>`WEBHOOK_SIGNING_SECRET` | Kubernetes Encrypted Secrets | 90 Days | Cryptographic nonces burned in PostgreSQL database table (`mcp_burned_nonces`). |

---

## 2. Zero-Fallback & Fail-Closed Guardrails

In compliance with engineering safety principles:
1. **No Source Code Secrets:**
   - No plaintext passwords, API keys, private keys, or default development tokens exist in source code or committed artifacts.
2. **Mandatory Startup Key Validation:**
   - If `JWT_SECRET` or `ENCRYPTION_KEY` is undefined or shorter than 32 bytes (256 bits), the server process throws an unrecoverable `Error` during module initialization and exits immediately.
   - Key zero-padding (`padEnd`) is strictly forbidden and rejected.
3. **Envelope Encryption for Per-User TOTP Secrets:**
   - User RFC 6238 TOTP secrets are encrypted before writing to PostgreSQL using `ENCRYPTION_KEY` and AES-256-GCM.
   - Plaintext TOTP secrets are never logged or stored in cleartext.
4. **Disposable One-Time Recovery Codes:**
   - User recovery codes are never stored in plaintext. They are hashed using SHA-256 before insertion into `user_recovery_codes` and permanently marked `is_used = true` upon first redemption.
