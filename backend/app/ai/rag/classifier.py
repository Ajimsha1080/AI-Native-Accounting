"""Intent and Query Classifier for Enterprise Accounting AI.

Categorizes user requests to determine proper execution path:
- Policy questions -> RAG retrieval
- Financial calculations & totals -> Deterministic accounting database queries
- Financial mutations -> Authorized service with approval workflow & permission gates
- Ambiguous questions -> Clarification / safe abstention
"""

import re
from typing import NamedTuple

from app.ai.rag.schemas import QueryIntent


class ClassificationResult(NamedTuple):
    intent: QueryIntent
    confidence: float
    detected_identifiers: dict[str, str]
    target_category: str | None
    requires_deterministic_db: bool
    requires_approval_workflow: bool


CALCULATION_KEYWORDS = [
    "total revenue",
    "total expense",
    "net profit",
    "gross profit",
    "trial balance",
    "balance sheet",
    "vat payable",
    "cash position",
    "aging summary",
    "how much revenue",
    "total sales",
    "total expenses",
    "aggregate balance",
    "how much did we spend",
]

ACTION_KEYWORDS = [
    "post journal",
    "post entry",
    "lock period",
    "lock the period",
    "void invoice",
    "approve bill",
    "reconcile statement",
    "create invoice",
    "delete entry",
]

STATUTORY_KEYWORDS = [
    "vat rate",
    "article 8",
    "article 48",
    "article 51",
    "reverse charge",
    "rcm",
    "zero rated",
    "exempt",
    "corporate tax",
    "qfzp",
    "de-minimis",
    "cabinet decision",
    "fta",
    "tax law",
    "end of service gratuity",
    "eosg",
    "wps sif",
    "ifrs 15",
    "ifrs 16",
    "entertainment expense",
]


def classify_query(query: str) -> ClassificationResult:
    """Classifies user query into the appropriate operational intent."""
    lower = query.lower()

    # 1. Action intent check
    for act in ACTION_KEYWORDS:
        if act in lower:
            return ClassificationResult(
                intent=QueryIntent.FINANCIAL_ACTION,
                confidence=0.98,
                detected_identifiers={},
                target_category="GOVERNANCE",
                requires_deterministic_db=False,
                requires_approval_workflow=True,
            )

    # 2. Financial calculation check -> routes to deterministic SQL!
    for calc in CALCULATION_KEYWORDS:
        if calc in lower:
            return ClassificationResult(
                intent=QueryIntent.FINANCIAL_CALCULATION,
                confidence=0.95,
                detected_identifiers={},
                target_category="LEDGER",
                requires_deterministic_db=True,
                requires_approval_workflow=False,
            )

    # 3. Document-specific check
    inv_match = re.search(r"\b(INV-[A-Za-z0-9\-_]+)\b", query, re.IGNORECASE)
    bill_match = re.search(r"\b(BILL-[A-Za-z0-9\-_]+)\b", query, re.IGNORECASE)
    vouch_match = re.search(r"\b(JV-[A-Za-z0-9\-_]+)\b", query, re.IGNORECASE)

    extracted_ids = {}
    if inv_match:
        extracted_ids["invoice_number"] = inv_match.group(1)
    if bill_match:
        extracted_ids["bill_number"] = bill_match.group(1)
    if vouch_match:
        extracted_ids["voucher_number"] = vouch_match.group(1)

    if extracted_ids:
        return ClassificationResult(
            intent=QueryIntent.DOCUMENT_SPECIFIC,
            confidence=0.92,
            detected_identifiers=extracted_ids,
            target_category="DOCUMENTS",
            requires_deterministic_db=True,
            requires_approval_workflow=False,
        )

    # 4. Knowledge & Statutory Policy
    for stat in STATUTORY_KEYWORDS:
        if stat in lower:
            cat = (
                "VAT"
                if any(
                    k in lower
                    for k in [
                        "vat",
                        "tax",
                        "reverse charge",
                        "rcm",
                        "article 48",
                        "article 8",
                        "entertainment",
                        "zero rated",
                        "exempt",
                    ]
                )
                else "IFRS"
            )
            if "gratuity" in lower or "eosg" in lower or "wps" in lower or "payroll" in lower:
                cat = "PAYROLL"
            elif "corporate tax" in lower or "qfzp" in lower:
                cat = "CORPORATE_TAX"

            return ClassificationResult(
                intent=QueryIntent.KNOWLEDGE_POLICY,
                confidence=0.96,
                detected_identifiers={},
                target_category=cat,
                requires_deterministic_db=False,
                requires_approval_workflow=False,
            )

    # 5. Accounting explanation check
    if any(
        q in lower
        for q in ["why debit", "why credit", "double entry", "debit or credit", "normal balance"]
    ):
        return ClassificationResult(
            intent=QueryIntent.ACCOUNTING_EXPLANATION,
            confidence=0.88,
            detected_identifiers={},
            target_category="LEDGER",
            requires_deterministic_db=False,
            requires_approval_workflow=False,
        )

    # 6. Ambiguous / Generic
    if len(lower.split()) < 4 and not any(
        term in lower for term in ["tax", "vat", "wps", "gratuity"]
    ):
        return ClassificationResult(
            intent=QueryIntent.AMBIGUOUS_UNSUPPORTED,
            confidence=0.75,
            detected_identifiers={},
            target_category=None,
            requires_deterministic_db=False,
            requires_approval_workflow=False,
        )

    # Default to Knowledge Policy RAG
    return ClassificationResult(
        intent=QueryIntent.KNOWLEDGE_POLICY,
        confidence=0.80,
        detected_identifiers={},
        target_category=None,
        requires_deterministic_db=False,
        requires_approval_workflow=False,
    )
