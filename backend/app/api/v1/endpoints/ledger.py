import uuid
from datetime import date, datetime
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
    return metrics


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
        entry_dt = datetime.strptime(req.entry_date, "%Y-%m-%d").date()
    except ValueError:
        entry_dt = date.today()

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
