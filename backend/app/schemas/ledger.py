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
    entity_id: str
    period_id: str
    entry_number: str
    entry_date: str
    narration: str
    lines: list[JournalLineInput] = Field(min_length=2)


class PostJournalResponse(BaseModel):
    success: bool
    voucherId: str
    entryNumber: str
    totalAmountFils: int
    hashChain: str
    status: str
