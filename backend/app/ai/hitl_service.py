"""Human-in-the-Loop (HITL) Statutory Approval & Segregation of Duties Engine.

Enforces:
1. Four-eyes principle (Segregation of Duties): Creator cannot approve their own document.
2. Statutory threshold limits (Tier 1 <= 10k AED, Tier 2 <= 50k AED, Tier 3 > 50k AED).
3. Field correction workflow: Approvers can correct OCR-extracted fields; corrections re-run deterministic checks.
4. Immutable audit trail and AI action telemetry with actual token counts and ledger posting locks.
"""

import logging
import uuid
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any

from app.ai.deterministic_checks import DeterministicFinancialValidator
from app.core.config import settings

logger = logging.getLogger("ledgerae.ai.hitl")


@dataclass
class HitlApprovalItem:
    id: str
    tenantId: str
    documentId: str
    documentType: str  # "INVOICE" | "BANK_STATEMENT"
    creatorUserId: str
    approverUserId: str | None = None
    approverRole: str | None = None
    amountFils: int = 0
    status: str = "PENDING_APPROVAL"  # PENDING_APPROVAL | APPROVED | REJECTED | CORRECTED_AND_APPROVED
    requiresHumanReview: bool = True
    reviewReasons: list[str] = field(default_factory=list)
    extractedData: dict[str, Any] = field(default_factory=dict)
    validationResult: dict[str, Any] = field(default_factory=dict)
    corrections: dict[str, Any] = field(default_factory=dict)
    createdAt: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    resolvedAt: str | None = None
    ledgerPostingAllowed: bool = False
    auditTrail: list[dict[str, Any]] = field(default_factory=list)


# In-memory tenant-isolated store for pending approval items
_APPROVAL_ITEMS: dict[str, HitlApprovalItem] = {}


class HitlWorkflowEngine:
    """Enforces segregation of duties, tier-based limits, and audit compliance."""

    @classmethod
    def create_approval_item(
        cls,
        *,
        tenant_id: str,
        document_id: str,
        document_type: str,
        creator_user_id: str,
        amount_fils: int,
        requires_human_review: bool,
        review_reasons: list[str],
        extracted_data: dict[str, Any],
        validation_result: dict[str, Any],
        token_usage: dict[str, int] | None = None,
    ) -> HitlApprovalItem:
        item_id = str(uuid.uuid4())
        threshold_fils = getattr(settings, "DEFAULT_HITL_THRESHOLD_FILS", 1000000)

        must_review = requires_human_review or (amount_fils > threshold_fils) or (len(review_reasons) > 0)
        reasons = list(review_reasons)
        if amount_fils > threshold_fils and "High-value transaction exceeds statutory HITL threshold" not in reasons:
            reasons.append(f"Statutory limit: Total amount ({amount_fils} fils) exceeds HITL threshold ({threshold_fils} fils).")

        item = HitlApprovalItem(
            id=item_id,
            tenantId=tenant_id,
            documentId=document_id,
            documentType=document_type,
            creatorUserId=creator_user_id,
            amountFils=amount_fils,
            status="PENDING_APPROVAL" if must_review else "AUTO_VERIFIED",
            requiresHumanReview=must_review,
            reviewReasons=reasons,
            extractedData=extracted_data,
            validationResult=validation_result,
            ledgerPostingAllowed=not must_review,
            auditTrail=[
                {
                    "action": "DOCUMENT_INGESTED",
                    "timestamp": datetime.now(UTC).isoformat(),
                    "userId": creator_user_id,
                    "tokenUsage": token_usage or {"promptTokens": 0, "completionTokens": 0},
                    "reasons": reasons,
                }
            ],
        )

        _APPROVAL_ITEMS[item_id] = item
        return item

    @classmethod
    def get_approval_item(cls, item_id: str, tenant_id: str) -> HitlApprovalItem | None:
        """Retrieves item with strict multi-tenant isolation."""
        item = _APPROVAL_ITEMS.get(item_id)
        if item and item.tenantId == tenant_id:
            return item
        return None

    @classmethod
    def process_approval(
        cls,
        *,
        item_id: str,
        tenant_id: str,
        approver_user_id: str,
        approver_role: str,
        decision: str,  # "APPROVE" | "REJECT"
        corrections: dict[str, Any] | None = None,
        rejection_reason: str | None = None,
    ) -> tuple[bool, str, HitlApprovalItem]:
        item = cls.get_approval_item(item_id, tenant_id)
        if not item:
            return False, "Approval item not found or unauthorized.", None  # type: ignore

        # 1. Four-Eyes Principle / Segregation of Duties
        if item.creatorUserId == approver_user_id:
            return False, "Segregation of duties violation: Creators cannot approve their own documents.", item

        # 2. RBAC Tier Checks
        # Tier 1 <= 10,000 AED (1,000,000 fils)
        # Tier 2 <= 50,000 AED (5,000,000 fils)
        # Tier 3 > 50,000 AED
        amount_fils = item.amountFils
        role = approver_role.upper()

        if amount_fils > 5000000:
            if role not in ("CFO", "EXECUTIVE", "ADMIN"):
                return False, f"Approval tier violation: Amount ({amount_fils} fils) requires CFO / Executive role.", item
        elif amount_fils > 1000000:
            if role not in ("FINANCIAL_CONTROLLER", "CONTROLLER", "CFO", "EXECUTIVE", "ADMIN"):
                return False, f"Approval tier violation: Amount ({amount_fils} fils) requires Financial Controller or higher.", item
        else:
            if role not in ("SENIOR_ACCOUNTANT", "ACCOUNTANT", "CONTROLLER", "FINANCIAL_CONTROLLER", "CFO", "EXECUTIVE", "ADMIN"):
                return False, "Approver lacks bill approval permission.", item

        if decision.upper() == "REJECT":
            item.status = "REJECTED"
            item.approverUserId = approver_user_id
            item.approverRole = approver_role
            item.resolvedAt = datetime.now(UTC).isoformat()
            item.ledgerPostingAllowed = False
            item.auditTrail.append({
                "action": "DOCUMENT_REJECTED",
                "timestamp": item.resolvedAt,
                "approverUserId": approver_user_id,
                "role": approver_role,
                "reason": rejection_reason or "Rejected by reviewer",
            })
            return True, "Document rejected.", item

        # 3. Handle corrections & re-run deterministic checks
        if corrections:
            updated_data = dict(item.extractedData)
            updated_data.update(corrections)
            item.corrections = corrections
            item.extractedData = updated_data

            if item.documentType == "INVOICE":
                val = DeterministicFinancialValidator.validate_invoice(
                    vendor_name=updated_data.get("vendorName"),
                    vendor_trn=updated_data.get("vendorTrn"),
                    invoice_number=updated_data.get("invoiceNumber"),
                    invoice_date=updated_data.get("invoiceDate"),
                    subtotal_fils=updated_data.get("subtotalFils"),
                    vat_total_fils=updated_data.get("vatTotalFils"),
                    total_fils=updated_data.get("totalFils"),
                    lines=updated_data.get("lines", []),
                )
                item.validationResult = asdict(val)
                item.amountFils = updated_data.get("totalFils") or item.amountFils

                if not val.isDebitsEqualCredits:
                    return False, f"Correction rejected: Journal remains unbalanced ({val.reviewReasons})", item
                if not val.isSubtotalPlusVatEqualTotal:
                    return False, f"Correction rejected: Mathematical error persists ({val.reviewReasons})", item

            elif item.documentType == "BANK_STATEMENT":
                val_stmt = DeterministicFinancialValidator.validate_bank_statement(
                    account=updated_data.get("account"),
                    opening_balance_fils=updated_data.get("openingBalanceFils"),
                    closing_balance_fils=updated_data.get("closingBalanceFils"),
                    rows=updated_data.get("rows", []),
                )
                item.validationResult = asdict(val_stmt)
                if not val_stmt.isStatementArithmeticValid or val_stmt.failingRowNumbers:
                    return False, f"Correction rejected: Bank statement balance discrepancy in rows {val_stmt.failingRowNumbers}", item

            item.status = "CORRECTED_AND_APPROVED"
        else:
            # Check if existing validation passed or if reviewer is signing off on warnings
            item.status = "APPROVED"

        item.approverUserId = approver_user_id
        item.approverRole = approver_role
        item.resolvedAt = datetime.now(UTC).isoformat()
        item.ledgerPostingAllowed = True
        item.auditTrail.append({
            "action": "DOCUMENT_APPROVED",
            "status": item.status,
            "timestamp": item.resolvedAt,
            "approverUserId": approver_user_id,
            "role": approver_role,
            "correctionsApplied": bool(corrections),
        })

        return True, "Document approved for ledger posting.", item
