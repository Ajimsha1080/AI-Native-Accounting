from typing import Any

from pydantic import BaseModel, Field


class CreateInvoiceRequest(BaseModel):
    customerName: str = Field(min_length=1)
    invoiceNumber: str = Field(min_length=1)
    issueDate: str
    dueDate: str
    subtotalFils: int = Field(ge=0)
    vatTotalFils: int = Field(ge=0)
    totalFils: int = Field(ge=0)
    currency: str = "AED"


class CreateVendorBillRequest(BaseModel):
    vendorName: str = Field(min_length=1)
    billNumber: str = Field(min_length=1)
    billDate: str
    dueDate: str
    subtotalFils: int = Field(ge=0)
    vatTotalFils: int = Field(ge=0)
    totalFils: int = Field(ge=0)
    currency: str = "AED"


class MatchBankLineRequest(BaseModel):
    lineId: str
    matchedJournalLineId: str | None = None
    action: str = "MATCH"


class ReportBuilderRequest(BaseModel):
    reportType: str = "CUSTOM"
    categories: list[str] = Field(default_factory=list)
    dateFrom: str | None = None
    dateTo: str | None = None
    format: str = "JSON"


class CloseActionRequest(BaseModel):
    action: str = "LOCK_PERIOD"
    periodId: str | None = None
    isHardLock: bool = True


class WpsRequest(BaseModel):
    action: str = "GENERATE_SIF"
    salaryMonth: str = "2026-03"
    employerRoutingCode: str = "CBUAE001"
    employerCrn: str = "MOHRE-DXB-9871"


class AiProposalActionRequest(BaseModel):
    proposalId: str
    action: str = "APPROVE"


class EInvoiceActionRequest(BaseModel):
    messageId: str
    action: str = "RETRY"


class FixedAssetPostRequest(BaseModel):
    assetId: str
    periodDate: str = "2026-02-28"
    amountBase: str | int = 0


class CreatePaymentRequest(BaseModel):
    partnerId: str | None = None
    paymentNumber: str | None = None
    paymentType: str = "OUTBOUND"
    amountBase: int = 0
    currency: str = "AED"
    partnerName: str = "Direct Settlement"


class ImportMigrationRequest(BaseModel):
    sourceSystem: str = "QUICKBOOKS"
    filename: str = "import.csv"
    accounts: list[dict[str, Any]] = Field(default_factory=list)
