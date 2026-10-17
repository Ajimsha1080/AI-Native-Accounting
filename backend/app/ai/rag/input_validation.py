"""Input Validation and Adversarial Prompt Injection Defense.

Normalizes whitespace, checks boundaries, and neutralizes prompt injection patterns
attempting to override system prompt or tenant isolation controls.
"""

import re
from typing import NamedTuple

from app.ai.guardrails.financial_guardrails import FinancialGuardrailViolation


class ValidatedInput(NamedTuple):
    cleaned_query: str
    is_safe: bool
    injection_warnings: list[str]


# Pattern definitions for adversarial instructions
INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions", re.IGNORECASE),
    re.compile(r"system\s*:\s*(?:you\s+are|override|disregard)", re.IGNORECASE),
    re.compile(r"<\s*system\s*>", re.IGNORECASE),
    re.compile(r"jailbreak|developer\s+mode|dan\s+mode", re.IGNORECASE),
    re.compile(r"switch\s+(?:tenant|organization|database)", re.IGNORECASE),
    re.compile(r"set\s+local\s+app\.current_tenant_id", re.IGNORECASE),
    re.compile(r"bypass\s+(?:rls|tenant|security|controls)", re.IGNORECASE),
    re.compile(r"print\s+(?:all\s+)?(?:passwords|tokens|secrets|api\s*keys)", re.IGNORECASE),
]


def normalize_and_validate_input(query: str, tenant_id: str) -> ValidatedInput:
    """Normalizes whitespace and validates query safety and bounds."""
    if not tenant_id or tenant_id == "00000000-0000-0000-0000-000000000000":
        raise FinancialGuardrailViolation(
            "Invalid tenant context for RAG retrieval", "INVALID_TENANT"
        )

    # Normalize whitespace
    cleaned = " ".join(query.strip().split())

    if len(cleaned) < 3:
        raise FinancialGuardrailViolation(
            "Query too short for statutory guidance retrieval", "QUERY_TOO_SHORT"
        )

    if len(cleaned) > 1000:
        raise FinancialGuardrailViolation(
            "Query exceeds maximum allowed length of 1000 chars", "QUERY_TOO_LONG"
        )

    warnings: list[str] = []
    for pattern in INJECTION_PATTERNS:
        if pattern.search(cleaned):
            warnings.append(f"Potential prompt injection detected: {pattern.pattern}")

    is_safe = len(warnings) == 0

    return ValidatedInput(
        cleaned_query=cleaned,
        is_safe=is_safe,
        injection_warnings=warnings,
    )
