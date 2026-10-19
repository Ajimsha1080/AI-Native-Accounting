"""Unified Guardrail Orchestrator for Ledger AE.

Executes a synchronous battery of financial, security, and regulatory guardrails
prior to any AI proposal generation, autonomous reconciliation, or RAG output.
"""

from datetime import date
from typing import Any

from app.ai.guardrails.financial_guardrails import (
    DEFAULT_HITL_THRESHOLD_FILS,
    FinancialGuardrailViolation,
    evaluate_hitl_threshold,
    validate_double_entry_equilibrium,
    validate_fiscal_period_open,
    validate_rag_retrieval_query,
    validate_uae_vat_rate,
)
from app.ai.guardrails.security_guardrails import (
    SecurityGuardrailViolation,
    sanitize_pii_and_credentials,
    validate_prompt_safety,
)


class GuardrailReport:
    def __init__(self, target_type: str):
        self.target_type = target_type
        self.passed = True
        self.violations: list[dict[str, Any]] = []
        self.warnings: list[dict[str, Any]] = []
        self.guardrails_checked: list[str] = []
        self.hitl_evaluation: dict[str, Any] | None = None
        self.sanitized_content: str | None = None

    def add_violation(
        self, name: str, code: str, message: str, details: dict[str, Any] | None = None
    ):
        self.passed = False
        self.violations.append(
            {
                "guardrail": name,
                "code": code,
                "message": message,
                "severity": "CRITICAL",
                "details": details or {},
            }
        )

    def add_warning(self, name: str, message: str, details: dict[str, Any] | None = None):
        self.warnings.append(
            {
                "guardrail": name,
                "message": message,
                "severity": "WARNING",
                "details": details or {},
            }
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "targetType": self.target_type,
            "guardrailsChecked": self.guardrails_checked,
            "violationsCount": len(self.violations),
            "warningsCount": len(self.warnings),
            "violations": self.violations,
            "warnings": self.warnings,
            "hitlEvaluation": self.hitl_evaluation,
            "sanitizedContent": self.sanitized_content,
        }


class GuardrailOrchestrator:
    """Enterprise Guardrail Engine for Autonomous Accounting."""

    def evaluate_query(self, query: str, tenant_id: str) -> GuardrailReport:
        """Validates conversational / RAG search queries against security & tenant bounds."""
        report = GuardrailReport(target_type="QUERY")

        # 1. Tenant ID validation
        report.guardrails_checked.append("TENANT_ISOLATION")
        try:
            validate_rag_retrieval_query(query, tenant_id)
        except FinancialGuardrailViolation as e:
            report.add_violation("TENANT_ISOLATION", e.code, e.message)

        # 2. Prompt Injection & Adversarial Jailbreak Defense
        report.guardrails_checked.append("PROMPT_INJECTION_SHIELD")
        try:
            validate_prompt_safety(query)
        except SecurityGuardrailViolation as e:
            report.add_violation(
                "PROMPT_INJECTION_SHIELD", e.code, e.message, {"pattern": e.pattern}
            )

        # 3. PII & Credential Masking
        report.guardrails_checked.append("PII_CREDENTIAL_SANITIZER")
        pii_res = sanitize_pii_and_credentials(query)
        report.sanitized_content = pii_res["sanitizedText"]
        if pii_res["containsPii"]:
            report.add_warning(
                "PII_CREDENTIAL_SANITIZER",
                f"Sensitive financial data detected and masked ({pii_res['redactionsApplied']} items).",
                {"redactions": pii_res["redactionsApplied"]},
            )

        return report

    def evaluate_journal_proposal(
        self,
        lines: list[dict[str, Any]],
        entry_date: date | None = None,
        locked_periods: list[dict[str, Any]] | None = None,
        vat_rate: float | None = None,
        hitl_threshold_fils: int = DEFAULT_HITL_THRESHOLD_FILS,
    ) -> GuardrailReport:
        """Validates proposed double-entry journals against financial equilibrium, period lock,
        HITL limits, and VAT compliance.
        """
        report = GuardrailReport(target_type="JOURNAL_PROPOSAL")

        # 1. Double-Entry Zero Tolerance
        report.guardrails_checked.append("DOUBLE_ENTRY_EQUILIBRIUM")
        try:
            balance_res = validate_double_entry_equilibrium(lines)
            total_amount = balance_res["totalDebitsFils"]
        except FinancialGuardrailViolation as e:
            report.add_violation("DOUBLE_ENTRY_EQUILIBRIUM", e.code, e.message, e.details)
            total_amount = sum(
                int(line.get("amountMinorUnits") or line.get("amount_fils") or 0)
                for line in lines
                if str(line.get("amountMinorUnits", "0")).isdigit()
            )

        # 2. Closed Period Check
        if entry_date and locked_periods:
            report.guardrails_checked.append("CLOSED_PERIOD_IMMUTABILITY")
            try:
                validate_fiscal_period_open(entry_date, locked_periods)
            except FinancialGuardrailViolation as e:
                report.add_violation("CLOSED_PERIOD_IMMUTABILITY", e.code, e.message, e.details)

        # 3. HITL Dual-Authorization Threshold
        report.guardrails_checked.append("HITL_DUAL_CONTROL")
        hitl_eval = evaluate_hitl_threshold(total_amount, hitl_threshold_fils)
        report.hitl_evaluation = hitl_eval
        if hitl_eval["requiresHumanApproval"]:
            report.add_warning(
                "HITL_DUAL_CONTROL",
                hitl_eval["reason"],
                {"approvalLevel": hitl_eval["approvalLevel"]},
            )

        # 4. UAE VAT Rate Verification
        if vat_rate is not None:
            report.guardrails_checked.append("STATUTORY_UAE_VAT")
            try:
                validate_uae_vat_rate(vat_rate)
            except FinancialGuardrailViolation as e:
                report.add_violation("STATUTORY_UAE_VAT", e.code, e.message, e.details)

        return report
