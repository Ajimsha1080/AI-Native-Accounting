from typing import Any


class LedgerAppException(Exception):
    """Base exception for all domain and ledger business rule errors."""

    def __init__(
        self, message: str, code: str = "INTERNAL_ERROR", details: dict[str, Any] | None = None
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details or {}


class PeriodLockedException(LedgerAppException):
    def __init__(
        self, message: str = "Cannot post transactions into a closed or locked accounting period."
    ):
        super().__init__(message, code="PERIOD_LOCKED")


class UnbalancedJournalException(LedgerAppException):
    def __init__(self, debit_fils: int, credit_fils: int):
        variance = debit_fils - credit_fils
        super().__init__(
            f"Journal entry is unbalanced. Total debits ({debit_fils} fils) must equal total credits ({credit_fils} fils). Variance: {variance} fils.",
            code="UNBALANCED_JOURNAL",
            details={
                "debit_fils": debit_fils,
                "credit_fils": credit_fils,
                "variance_fils": variance,
            },
        )


class CrossTenantAccessException(LedgerAppException):
    def __init__(self, message: str = "Access denied: Cross-tenant operation prohibited."):
        super().__init__(message, code="CROSS_TENANT_ACCESS_DENIED")


class AuthException(LedgerAppException):
    def __init__(self, message: str, code: str = "UNAUTHORIZED"):
        super().__init__(message, code=code)


class EntityNotFoundException(LedgerAppException):
    def __init__(self, entity_name: str, identifier: str):
        super().__init__(
            f"{entity_name} with ID '{identifier}' not found.", code="ENTITY_NOT_FOUND"
        )
