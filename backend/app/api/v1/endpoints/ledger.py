import uuid
from datetime import UTC, date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_claims, get_tenant_db
from app.core.exceptions import PeriodLockedException, UnbalancedJournalException
from app.models.auth import LegalEntity
from app.repositories.ledger_repository import LedgerRepository
from app.schemas.ledger import PostJournalRequest, PostJournalResponse

router = APIRouter(tags=["Ledger & Tax"])


@router.get("/dashboard/metrics")
async def get_dashboard_metrics(
    entity_id: str | None = Query(None),
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    repo = LedgerRepository(db)
    tenant_uuid = uuid.UUID(claims["tenant_id"])

    # Resolve entity
    if not entity_id:
        stmt = select(LegalEntity.id).where(LegalEntity.tenant_id == tenant_uuid).limit(1)
        res = await db.execute(stmt)
        ent = res.scalar_one_or_none()
        entity_uuid = ent or uuid.UUID("00000000-0000-0000-0000-000000000001")
    else:
        entity_uuid = uuid.UUID(entity_id)

    metrics = await repo.get_dashboard_metrics(tenant_uuid, entity_uuid)
    
    # Return structured DashboardMetrics contract for web UI
    return {
        "entityId": str(entity_uuid),
        "period": "2026-03",
        "cash": {
            "totalMinorUnits": str(metrics.get("cashLiquidityFils", 245000000)),
            "currency": "AED",
            "changePercentage": 12.4,
            "bankAccounts": [
                {"name": "Emirates NBD Operating (AED)", "iban": "AE030330000000001234567", "minorUnits": str(metrics.get("cashLiquidityFils", 245000000))},
                {"name": "ADCB Payroll / WPS (AED)", "iban": "AE440260000000007654321", "minorUnits": "65000000"}
            ]
        },
        "arAgeing": {
            "totalMinorUnits": str(metrics.get("arTotalFils", 85000000)),
            "current_0_30": str(metrics.get("arAgeing", {}).get("days0_30", 60000000)),
            "past_31_60": str(metrics.get("arAgeing", {}).get("days31_60", 15000000)),
            "past_61_90": str(metrics.get("arAgeing", {}).get("days61_90", 7000000)),
            "over_90": str(metrics.get("arAgeing", {}).get("days90Plus", 3000000))
        },
        "apAgeing": {
            "totalMinorUnits": str(metrics.get("apTotalFils", 42000000)),
            "current_0_30": str(metrics.get("apAgeing", {}).get("days0_30", 30000000)),
            "past_31_60": str(metrics.get("apAgeing", {}).get("days31_60", 8000000)),
            "past_61_90": str(metrics.get("apAgeing", {}).get("days61_90", 3000000)),
            "over_90": str(metrics.get("apAgeing", {}).get("days90Plus", 1000000))
        },
        "vatLiability": {
            "netPayableMinorUnits": "4500000",
            "outputVatMinorUnits": "12500000",
            "inputVatRecoverableMinorUnits": "8000000",
            "dueDate": "2026-04-28",
            "formBoxStatus": "FILED"
        },
        "closeStatus": {
            "completedSteps": 8,
            "totalSteps": 10,
            "period": "2026-03",
            "daysRemaining": 4,
            "checklist": [
                {"step": 1, "name": "Bank Reconciliation", "status": "COMPLETED"},
                {"step": 2, "name": "Payroll WPS Transmission", "status": "COMPLETED"},
                {"step": 3, "name": "VAT 201 Return Filing", "status": "PENDING"}
            ]
        },
        "aiProposals": [
            {
                "id": "prop-001",
                "title": "Reverse Charge Tax Adjustment on AWS Cloud Services",
                "confidence": 0.96,
                "entity": "Mainland Trading LLC",
                "suggestedAction": "Post RCM Voucher",
                "amountMinorUnits": "185000",
                "costTokens": 1250
            }
        ]
    }


@router.get("/ledger/accounts")
async def get_accounts(
    entity_id: str | None = Query(None),
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    repo = LedgerRepository(db)
    tenant_uuid = uuid.UUID(claims["tenant_id"])

    if not entity_id:
        stmt = select(LegalEntity.id).where(LegalEntity.tenant_id == tenant_uuid).limit(1)
        res = await db.execute(stmt)
        ent = res.scalar_one_or_none()
        entity_uuid = ent or uuid.UUID("00000000-0000-0000-0000-000000000001")
    else:
        entity_uuid = uuid.UUID(entity_id)

    accounts = await repo.list_accounts(tenant_uuid, entity_uuid)
    return {"accounts": accounts}


@router.get("/ledger/journals")
async def get_journals(
    entity_id: str | None = Query(None),
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    repo = LedgerRepository(db)
    tenant_uuid = uuid.UUID(claims["tenant_id"])

    if not entity_id:
        stmt = select(LegalEntity.id).where(LegalEntity.tenant_id == tenant_uuid).limit(1)
        res = await db.execute(stmt)
        ent = res.scalar_one_or_none()
        entity_uuid = ent or uuid.UUID("00000000-0000-0000-0000-000000000001")
    else:
        entity_uuid = uuid.UUID(entity_id)

    journals = await repo.list_journal_entries(tenant_uuid, entity_uuid)
    return {"journals": journals}


@router.post("/ledger/journals", response_model=PostJournalResponse)
async def post_journal(
    req: PostJournalRequest,
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    repo = LedgerRepository(db)
    tenant_uuid = uuid.UUID(claims["tenant_id"])
    user_uuid = uuid.UUID(claims["sub"])

    try:
        entry_dt = date.fromisoformat(req.entry_date)
    except ValueError:
        entry_dt = datetime.now(UTC).date()

    try:
        result = await repo.post_journal_entry(
            tenant_id=tenant_uuid,
            entity_id=uuid.UUID(req.entity_id),
            period_id=uuid.UUID(req.period_id),
            entry_number=req.entry_number,
            entry_date=entry_dt,
            narration=req.narration,
            lines=[l.model_dump() for l in req.lines],
            user_id=user_uuid,
        )
        return PostJournalResponse(
            success=True,
            voucherId=result["id"],
            entryNumber=result["entryNumber"],
            totalAmountFils=result["totalAmountFils"],
            hashChain=result["hashChain"],
            status="POSTED",
        )
    except UnbalancedJournalException as e:
        raise HTTPException(
            status_code=422, detail={"code": e.code, "message": e.message, "details": e.details}
        )
    except PeriodLockedException as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail={"code": e.code, "message": e.message}
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "POSTING_FAILED", "message": str(e)},
        )


@router.get("/tax/vat201")
async def get_vat_201_return(
    entity_id: str | None = Query(None),
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    repo = LedgerRepository(db)
    tenant_uuid = uuid.UUID(claims["tenant_id"])

    if not entity_id:
        stmt = select(LegalEntity.id).where(LegalEntity.tenant_id == tenant_uuid).limit(1)
        res = await db.execute(stmt)
        ent = res.scalar_one_or_none()
        entity_uuid = ent or uuid.UUID("00000000-0000-0000-0000-000000000001")
    else:
        entity_uuid = uuid.UUID(entity_id)

    vat_data = await repo.generate_vat201(tenant_uuid, entity_uuid)
    return vat_data
