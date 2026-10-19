from typing import Any

from pydantic import BaseModel, Field


class JournalLineInput(BaseModel):
    account_id: str
    description: str = Field(min_length=1)
    direction: str = Field(pattern="^(DEBIT|CREDIT|debit|credit)$")
    amount_fils: int = Field(gt=0, description="Strict integer minor units (fils)")
    vat_rate: str | None = None
    vat_amount_fils: int = Field(default=0, ge=0)
    trn: str | None = None
    emirate: str | None = "DUBAI"


class PostJournalRequest(BaseModel):
    action: str | None = None
    journal: dict[str, Any] | None = None
    entity_id: str | None = None
    period_id: str | None = None
    entry_number: str | None = None
    entry_date: str | None = None
    narration: str | None = None
    lines: list[JournalLineInput] = Field(default_factory=list)


class PostJournalResponse(BaseModel):
    success: bool
    voucherId: str | None = None
    entryNumber: str | None = None
    totalAmountFils: int = 0
    hashChain: str | None = None
    status: str = "POSTED"
    journal: dict[str, Any] | None = None
    isBalanced: bool | None = None
    varianceFils: int | None = None
