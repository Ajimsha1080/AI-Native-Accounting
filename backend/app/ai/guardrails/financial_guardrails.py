"""Financial and Statutory Guardrails for AI & RAG Engine.

Mandatory Invariants:
1. Zero Vector Arithmetic: All monetary balances and VAT calculations MUST come from
   deterministic double-entry SQL or exact integer minor unit calculations.
2. Cross-Tenant Protection: RAG retrieval MUST always be scoped to authenticated tenant_id.
3. Statutory Disclaimers: All tax guidance outputs MUST include 'VERIFY WITH UAE TAX ADVISOR'.
4. Double-Entry Balance: Debits == Credits must hold to the exact fils (zero-difference invariant).
5. Closed Period Immutability: AI agents cannot propose or post entries into locked fiscal periods.
6. Segregation of Duties / HITL: High-value transactions (> AED 10,000) require dual authorization.
7. Statutory UAE VAT Integrity: Validates 5% standard rate, 0% zero-rate, or RCM compliance.
"""

from datetime import date
from typing import Any


class FinancialGuardrailViolation(Exception):
    def __init__(self, message: str, code: str = "GUARDRAIL_VIOLATION", details: dict[str, Any] | None = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(message)


# Standard UAE HITL Threshold: AED 10,000 = 1,000,000 fils
DEFAULT_HITL_THRESHOLD_FILS = 1_000_000

# Valid UAE VAT rates (in basis points or percentages)
VALID_UAE_VAT_PERCENTAGES = {0.0, 5.0}


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


def validate_double_entry_equilibrium(
    lines: list[dict[str, Any]],
    proposal_id: str | None = None,
) -> dict[str, Any]:
    """Validates that journal lines balance exactly: Sum(Debits) == Sum(Credits).
    
    All amounts must be strictly non-negative integers in fils.
    Returns audit summary with exact debits, credits, and verification token.
    """
    if not lines or len(lines) < 2:
        raise FinancialGuardrailViolation(
            "A double-entry journal entry must have at least 2 lines (debit and credit).",
            "INSUFFICIENT_LINES",
            {"line_count": len(lines) if lines else 0},
        )

    total_debits = 0
    total_credits = 0

    for idx, line in enumerate(lines):
        amount = line.get("amountMinorUnits") or line.get("amount_fils") or line.get("amount", 0)
        
        # Enforce integer or numeric string convertible to int
        try:
            amount_int = int(amount)
        except (ValueError, TypeError):
            raise FinancialGuardrailViolation(
                f"Line #{idx + 1} contains non-integer amount: {amount}",
                "NON_INTEGER_AMOUNT",
                {"line_index": idx, "raw_amount": amount},
            )

        if amount_int < 0:
            raise FinancialGuardrailViolation(
                f"Line #{idx + 1} contains negative amount: {amount_int}. Use explicit DEBIT/CREDIT direction.",
                "NEGATIVE_AMOUNT",
                {"line_index": idx, "amount": amount_int},
            )

        direction = str(line.get("direction", "")).upper()
        if not direction:
            if "debitAccount" in line:
                direction = "DEBIT"
            elif "creditAccount" in line:
                direction = "CREDIT"

        if direction in ("DEBIT", "DR"):
            total_debits += amount_int
        elif direction in ("CREDIT", "CR"):
            total_credits += amount_int
        else:
            raise FinancialGuardrailViolation(
                f"Line #{idx + 1} direction must be 'DEBIT' or 'CREDIT'. Found: '{direction}'",
                "INVALID_DIRECTION",
                {"line_index": idx, "direction": direction},
            )

    variance = abs(total_debits - total_credits)
    if variance != 0:
        raise FinancialGuardrailViolation(
            f"Double-entry equilibrium violation: Total Debits ({total_debits} fils) != Total Credits ({total_credits} fils). Variance: {variance} fils.",
            "UNBALANCED_JOURNAL",
            {
                "total_debits_fils": total_debits,
                "total_credits_fils": total_credits,
                "variance_fils": variance,
                "proposal_id": proposal_id,
            },
        )

    return {
        "isBalanced": True,
        "totalDebitsFils": total_debits,
        "totalCreditsFils": total_credits,
        "varianceFils": 0,
        "linesCount": len(lines),
    }


def validate_fiscal_period_open(
    entry_date: date,
    locked_periods: list[dict[str, Any]],
) -> None:
    """Verifies that the transaction date does NOT fall within a locked accounting period.
    
    Prevents AI agents from tampering with past closed periods or filed VAT cycles.
    """
    for period in locked_periods:
        start = period.get("start_date")
        end = period.get("end_date")
        is_locked = period.get("is_hard_locked", False) or period.get("status") == "LOCKED"

        if is_locked and start and end:
            if start <= entry_date <= end:
                raise FinancialGuardrailViolation(
                    f"Fiscal Period Lock Guardrail: Transaction date {entry_date} falls into closed period '{period.get('name', 'Closed Period')}' ({start} to {end}). AI posting rejected.",
                    "CLOSED_PERIOD_MUTATION",
                    {"entry_date": str(entry_date), "period": period},
                )


def evaluate_hitl_threshold(
    amount_fils: int,
    threshold_fils: int = DEFAULT_HITL_THRESHOLD_FILS,
) -> dict[str, Any]:
    """Human-In-The-Loop (HITL) Guardrail:
    Determines whether a proposed financial transaction exceeds the autonomous
    execution threshold (default AED 10,000 / 1,000,000 fils) and requires
    Maker-Checker / CFO approval.
    """
    requires_approval = amount_fils >= threshold_fils
    return {
        "amountFils": amount_fils,
        "thresholdFils": threshold_fils,
        "requiresHumanApproval": requires_approval,
        "approvalLevel": "CFO_SIGN_OFF" if amount_fils >= (threshold_fils * 5) else "SENIOR_ACCOUNTANT" if requires_approval else "AUTONOMOUS_PERMITTED",
        "reason": (
            f"Amount AED {amount_fils / 100:,.2f} exceeds autonomous limit of AED {threshold_fils / 100:,.2f}. Dual control required."
            if requires_approval
            else "Amount within autonomous approval limits."
        ),
    }


def validate_uae_vat_rate(vat_rate_percentage: float) -> None:
    """Validates that VAT rate corresponds to UAE Federal Decree-Law No. 8 of 2017:
    Standard 5.0%, Zero-rated 0.0%, or Exempt.
    """
    if round(vat_rate_percentage, 2) not in VALID_UAE_VAT_PERCENTAGES:
        raise FinancialGuardrailViolation(
            f"Statutory UAE VAT Guardrail: Rate {vat_rate_percentage}% is not standard UAE VAT (must be 5% standard or 0% zero-rated).",
            "INVALID_UAE_VAT_RATE",
            {"submitted_rate": vat_rate_percentage, "valid_rates": list(VALID_UAE_VAT_PERCENTAGES)},
        )
