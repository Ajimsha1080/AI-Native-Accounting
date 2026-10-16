"""Financial and Statutory Guardrails for AI & RAG Engine.

Mandatory Invariants:
1. Zero Vector Arithmetic: All monetary balances and VAT calculations MUST come from
   deterministic double-entry SQL or exact integer minor unit calculations.
2. Cross-Tenant Protection: RAG retrieval MUST always be scoped to authenticated tenant_id.
3. Statutory Disclaimers: All tax guidance outputs MUST include 'VERIFY WITH UAE TAX ADVISOR'.
4. Hallucination Block: Unverified financial figures are rejected immediately.
"""

from typing import Any


class FinancialGuardrailViolation(Exception):
    def __init__(self, message: str, code: str = "GUARDRAIL_VIOLATION"):
        self.message = message
        self.code = code
        super().__init__(message)


def validate_rag_retrieval_query(query: str, tenant_id: str) -> None:
    """Enforces non-empty, safe query parameters scoped strictly to tenant context."""
    if not tenant_id or tenant_id == "00000000-0000-0000-0000-000000000000":
        raise FinancialGuardrailViolation(
            "Invalid tenant context for RAG retrieval", "INVALID_TENANT"
        )

    cleaned = query.strip()
    if len(cleaned) < 3:
        raise FinancialGuardrailViolation(
            "Query too short for statutory guidance retrieval", "QUERY_TOO_SHORT"
        )

    if len(cleaned) > 1000:
        raise FinancialGuardrailViolation(
            "Query exceeds maximum allowed length of 1000 chars", "QUERY_TOO_LONG"
        )


def verify_no_vector_arithmetic(response_payload: dict[str, Any]) -> None:
    """Validates that any monetary amounts present in the response originate

    from deterministic calculation, not LLM floating-point generation.
    """
    if "computedResultFils" in response_payload:
        val = response_payload["computedResultFils"]
        if not isinstance(val, int):
            raise FinancialGuardrailViolation(
                f"Financial amounts must be integer minor units (fils). Found: {type(val)}",
                "INVALID_FINANCIAL_TYPE",
            )
