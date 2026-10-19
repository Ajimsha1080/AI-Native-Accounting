"""Security and Prompt Guardrails for AI & Autonomous Agent.

Protects against:
1. Prompt Injections & Jailbreaks (system prompt leakage, instruction overrides, RLS bypass).
2. PII & Sensitive Credential Leakage (IBANs, Credit Cards, UAE National IDs, API Keys).
3. Cross-Tenant Context Contamination.
"""

import re
from typing import Any


class SecurityGuardrailViolation(Exception):
    def __init__(self, message: str, code: str = "SECURITY_VIOLATION", pattern: str | None = None):
        self.message = message
        self.code = code
        self.pattern = pattern
        super().__init__(message)


# Patterns that attempt to subvert agent instructions or ledger controls
PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions",
    r"disregard\s+(all\s+)?(previous|prior|system)\s+rules",
    r"you\s+are\s+now\s+(in\s+developer\s+mode|unrestricted|dan|jailbroken)",
    r"bypass\s+(rls|row\s+level\s+security|tenant\s+isolation|guardrail)",
    r"override\s+(debit|credit|accounting|double-entry|balance)\s+rule",
    r"print\s+(the\s+)?(system\s+prompt|initial\s+prompt|hidden\s+instruction)",
    r"reveal\s+(api\s+key|database\s+password|secret\s+key|token)",
    r"drop\s+table|delete\s+from|update\s+tenants|select\s+\*\s+from\s+users",
    r"force\s+balance\s+without\s+debits",
    r"post\s+unbalanced\s+journal",
]

# Regular expressions for sensitive PII
IBAN_PATTERN = re.compile(r"\bAE\d{2}[0-9A-Z]{19}\b", re.IGNORECASE)
EMIRATES_ID_PATTERN = re.compile(r"\b784[- ]?\d{4}[- ]?\d{7}[- ]?\d{1}\b")
CREDIT_CARD_PATTERN = re.compile(r"\b(?:\d{4}[- ]?){3}\d{4}\b")
JWT_PATTERN = re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")
SECRET_KEY_PATTERN = re.compile(
    r"\b(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|Bearer\s+[A-Za-z0-9_.-]+)\b"
)


def validate_prompt_safety(text: str) -> dict[str, Any]:
    """Inspects text for prompt injection, jailbreaks, and adversarial attack vectors.
    Raises SecurityGuardrailViolation if a malicious pattern is detected.
    """
    text_lower = text.lower()
    for pattern in PROMPT_INJECTION_PATTERNS:
        if re.search(pattern, text_lower):
            raise SecurityGuardrailViolation(
                f"Security Guardrail: Input contains prohibited adversarial pattern matching '{pattern}'. Request aborted.",
                code="PROMPT_INJECTION_DETECTED",
                pattern=pattern,
            )

    return {
        "isSafe": True,
        "checkedPatternsCount": len(PROMPT_INJECTION_PATTERNS),
    }


def sanitize_pii_and_credentials(text: str) -> dict[str, Any]:
    """Detects and redacts sensitive financial information:
    - UAE IBANs -> AE**...****
    - Emirates ID numbers -> 784-****-*******-*
    - Credit Card numbers -> ****-****-****-1234
    - Secret keys / JWT tokens -> [REDACTED_CREDENTIAL]
    """
    sanitized = text
    redactions_count = 0

    def mask_iban(match: re.Match) -> str:
        nonlocal redactions_count
        redactions_count += 1
        iban = match.group(0)
        return f"{iban[:4]}*****************{iban[-4:]}"

    def mask_emirates_id(match: re.Match) -> str:
        nonlocal redactions_count
        redactions_count += 1
        eid = match.group(0)
        return f"784-****-*******-{eid[-1]}"

    def mask_credit_card(match: re.Match) -> str:
        nonlocal redactions_count
        redactions_count += 1
        cc = match.group(0).replace(" ", "").replace("-", "")
        return f"****-****-****-{cc[-4:]}"

    def mask_secret(match: re.Match) -> str:
        nonlocal redactions_count
        redactions_count += 1
        return "[REDACTED_CREDENTIAL]"

    sanitized = IBAN_PATTERN.sub(mask_iban, sanitized)
    sanitized = EMIRATES_ID_PATTERN.sub(mask_emirates_id, sanitized)
    sanitized = CREDIT_CARD_PATTERN.sub(mask_credit_card, sanitized)
    sanitized = JWT_PATTERN.sub(mask_secret, sanitized)
    sanitized = SECRET_KEY_PATTERN.sub(mask_secret, sanitized)

    return {
        "originalText": text,
        "sanitizedText": sanitized,
        "redactionsApplied": redactions_count,
        "containsPii": redactions_count > 0,
    }


def validate_tenant_boundary(
    caller_tenant_id: str,
    target_tenant_id: str,
) -> None:
    """Enforces strict isolation between tenants; prevents cross-tenant access."""
    if not caller_tenant_id or caller_tenant_id != target_tenant_id:
        raise SecurityGuardrailViolation(
            f"Tenant Boundary Guardrail: Unauthorized cross-tenant operation attempted. Caller: {caller_tenant_id}, Target: {target_tenant_id}",
            code="CROSS_TENANT_VIOLATION",
        )
