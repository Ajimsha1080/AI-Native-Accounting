from typing import Any

from pydantic import BaseModel, Field


class CreateInvoiceRequest(BaseModel):
    action: str | None = None
    invoiceId: str | None = None
    decision: str | None = None
    customerName: str | None = "Standard Customer"
    invoiceNumber: str | None = None
    issueDate: str | None = None
    dueDate: str | None = None
    subtotalFils: int = 0
    vatTotalFils: int = 0
    totalFils: int = 0
    currency: str = "AED"


class CreateVendorBillRequest(BaseModel):
    billId: str | None = None
    action: str | None = None
    notes: str | None = None
    vendorName: str | None = "Standard Vendor"
    billNumber: str | None = None
    billDate: str | None = None
    dueDate: str | None = None
    subtotalFils: int = 0
    vatTotalFils: int = 0
    totalFils: int = 0
    currency: str = "AED"


class MatchBankLineRequest(BaseModel):
    statementLineId: str | None = None
    lineId: str | None = None
    ledgerLineId: str | None = None
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
    stepId: int | None = None
    isHardLock: bool = True


class WpsRequest(BaseModel):
    action: str = "GENERATE_SIF"
    payrollRunId: str | None = None
    salaryMonth: str = "2026-03"
    employerRoutingCode: str = "CBUAE001"
    employerCrn: str = "MOHRE-DXB-9871"


class AiProposalActionRequest(BaseModel):
    proposalId: str
    action: str = "APPROVE"
    decision: str | None = None
    rationale: str | None = None


class OpsConsoleRequest(BaseModel):
    isSandbox: bool = False


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
