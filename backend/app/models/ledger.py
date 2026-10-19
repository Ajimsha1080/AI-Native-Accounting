import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import JSON, BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AccountingPeriod(Base):
    __tablename__ = "accounting_periods"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        "legal_entity_id",
        UUID(as_uuid=True),
        ForeignKey("legal_entities.id", ondelete="CASCADE"),
        nullable=False,
    )
    fiscal_year: Mapped[int] = mapped_column(Integer, nullable=False, default=2026)
    period_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_soft_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    is_hard_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    locked_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def period_name(self) -> str:
        return f"{self.fiscal_year}-Q{self.period_number}"

    @property
    def status(self) -> str:
        if self.is_hard_locked:
            return "LOCKED"
        if self.is_soft_locked:
            return "SOFT_LOCKED"
        return "OPEN"


class Account(Base):
    __tablename__ = "chart_of_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        "legal_entity_id",
        UUID(as_uuid=True),
        ForeignKey("legal_entities.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_code: Mapped[str] = mapped_column("code", String(50), nullable=False)
    account_name_en: Mapped[str] = mapped_column("name_en", String(255), nullable=False)
    account_name_ar: Mapped[str] = mapped_column("name_ar", String(255), nullable=False)
    account_type: Mapped[str] = mapped_column("type", String(50), nullable=False)
    classification: Mapped[str] = mapped_column("sub_type", String(50), default="OPERATING")
    normal_balance: Mapped[str] = mapped_column(String(10), default="DEBIT")
    is_reconciliation_account: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    @property
    def currency(self) -> str:
        return "AED"

    @property
    def parent_account_id(self) -> uuid.UUID | None:
        return None


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        "legal_entity_id",
        UUID(as_uuid=True),
        ForeignKey("legal_entities.id", ondelete="CASCADE"),
        nullable=False,
    )
    book_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    period_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounting_periods.id"), nullable=False
    )
    entry_number: Mapped[str] = mapped_column(String(100), nullable=False)
    entry_date: Mapped[date] = mapped_column("posting_date", Date, nullable=False)
    document_date: Mapped[date] = mapped_column(Date, default=date.today)
    narration: Mapped[str] = mapped_column("memo_en", Text, nullable=False)
    memo_ar: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_module: Mapped[str] = mapped_column(String(50), default="GENERAL_LEDGER")
    source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="POSTED")  # DRAFT, POSTED, VOID
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    previous_entry_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    hash_chain: Mapped[str] = mapped_column("entry_hash", String(64), nullable=False)

    lines: Mapped[list["JournalLine"]] = relationship(
        "JournalLine", back_populates="journal", cascade="all, delete-orphan"
    )

    @property
    def entry_type(self) -> str:
        return "STANDARD"


class JournalLine(Base):
    __tablename__ = "journal_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    journal_id: Mapped[uuid.UUID] = mapped_column(
        "journal_entry_id",
        UUID(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chart_of_accounts.id"), nullable=False
    )
    line_number: Mapped[int] = mapped_column("line_order", Integer, nullable=False, default=1)
    currency: Mapped[str] = mapped_column(String(3), default="AED")
    amount_txn: Mapped[int] = mapped_column(BigInteger, default=0)
    amount_fils: Mapped[int] = mapped_column(
        "amount_base", BigInteger, nullable=False
    )  # Strict integer minor units
    fx_rate: Mapped[int] = mapped_column(BigInteger, default=100000000)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # DEBIT, CREDIT
    vat_rate: Mapped[str | None] = mapped_column("vat_code", String(50), nullable=True)
    vat_rate_bps: Mapped[int] = mapped_column(Integer, default=0)
    vat_amount_fils: Mapped[int] = mapped_column("vat_amount_base", BigInteger, default=0)

    journal: Mapped["JournalEntry"] = relationship("JournalEntry", back_populates="lines")
    account: Mapped["Account"] = relationship("Account")

    @property
    def description(self) -> str:
        return "General Ledger line"

    @property
    def trn(self) -> str | None:
        return None

    @property
    def emirate(self) -> str | None:
        return "DUBAI"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column("user_id", UUID(as_uuid=True), nullable=True)
    role: Mapped[str] = mapped_column(String(50), default="ACCOUNTANT")
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(100), nullable=False)
    payload_before: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    payload: Mapped[dict[str, Any] | None] = mapped_column("payload_after", JSON, nullable=True)
    current_hash: Mapped[str] = mapped_column("diff_hash", String(64), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    @property
    def previous_hash(self) -> str | None:
        return None


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        "legal_entity_id",
        UUID(as_uuid=True),
        ForeignKey("legal_entities.id", ondelete="CASCADE"),
        nullable=False,
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    invoice_number: Mapped[str] = mapped_column(String(100), nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="AED")
    subtotal_txn: Mapped[int] = mapped_column(BigInteger, default=0)
    vat_total_txn: Mapped[int] = mapped_column(BigInteger, default=0)
    total_txn: Mapped[int] = mapped_column(BigInteger, default=0)
    subtotal_fils: Mapped[int] = mapped_column(
        "subtotal_base", BigInteger, nullable=False, default=0
    )
    vat_total_fils: Mapped[int] = mapped_column(
        "vat_total_base", BigInteger, nullable=False, default=0
    )
    total_fils: Mapped[int] = mapped_column("total_base", BigInteger, nullable=False, default=0)
    status: Mapped[str] = mapped_column(
        String(20), default="ISSUED"
    )  # DRAFT, ISSUED, PAID, CANCELLED
    einvoice_status: Mapped[str] = mapped_column(String(50), default="CLEARED")
    ubl_xml_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    journal_entry_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    @property
    def customer_name(self) -> str:
        return "Standard Customer"


class VendorBill(Base):
    __tablename__ = "bills"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        "legal_entity_id",
        UUID(as_uuid=True),
        ForeignKey("legal_entities.id", ondelete="CASCADE"),
        nullable=False,
    )
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    bill_number: Mapped[str] = mapped_column(String(100), nullable=False)
    vendor_invoice_number: Mapped[str] = mapped_column(String(100), default="")
    bill_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="AED")
    subtotal_txn: Mapped[int] = mapped_column(BigInteger, default=0)
    vat_total_txn: Mapped[int] = mapped_column(BigInteger, default=0)
    total_txn: Mapped[int] = mapped_column(BigInteger, default=0)
    subtotal_fils: Mapped[int] = mapped_column(
        "subtotal_base", BigInteger, nullable=False, default=0
    )
    vat_total_fils: Mapped[int] = mapped_column(
        "vat_total_base", BigInteger, nullable=False, default=0
    )
    total_fils: Mapped[int] = mapped_column("total_base", BigInteger, nullable=False, default=0)
    status: Mapped[str] = mapped_column(
        String(20), default="PENDING"
    )  # PENDING, APPROVED, PAID, REJECTED
    match_status: Mapped[str] = mapped_column(String(50), default="UNMATCHED")
    journal_entry_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    @property
    def vendor_name(self) -> str:
        return "Standard Vendor"

    @property
    def approval_tier(self) -> str:
        return "APPROVED"


class BankStatementLine(Base):
    __tablename__ = "bank_statement_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    statement_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    line_date: Mapped[date] = mapped_column("booking_date", Date, nullable=False)
    description: Mapped[str] = mapped_column("narrative", Text, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    amount_fils: Mapped[int] = mapped_column("amount_txn", BigInteger, nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # DEBIT, CREDIT
    is_reconciled: Mapped[bool] = mapped_column(Boolean, default=False)
    matched_journal_line_id: Mapped[uuid.UUID | None] = mapped_column(
        "reconciled_journal_line_id", UUID(as_uuid=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    @property
    def status(self) -> str:
        return "RECONCILED" if self.is_reconciled else "UNMATCHED"


class AiProposal(Base):
    __tablename__ = "ai_proposals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        "legal_entity_id",
        UUID(as_uuid=True),
        ForeignKey("legal_entities.id", ondelete="CASCADE"),
        nullable=False,
    )
    proposal_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # INVOICE_EXTRACTION, RECONCILIATION, ADJUSTING_ENTRY
    category: Mapped[str] = mapped_column(String(50), default="GENERAL")
    status: Mapped[str] = mapped_column(
        String(20), default="PENDING"
    )  # PENDING, APPROVED, REJECTED
    confidence_score: Mapped[int] = mapped_column(Integer, default=95)
    statutory_citation: Mapped[str | None] = mapped_column("statutory_basis", Text, nullable=True)
    proposed_entry: Mapped[dict[str, Any]] = mapped_column("proposal_payload", JSON, default=dict)
    reasoning_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    @property
    def explanation_en(self) -> str:
        return self.reasoning_summary or ""

    @property
    def explanation_ar(self) -> str:
        return self.reasoning_summary or ""

    @property
    def title_en(self) -> str:
        return self.proposal_type.replace("_", " ").title()

    @property
    def title_ar(self) -> str:
        return self.proposal_type.replace("_", " ").title()

    @property
    def amount_fils(self) -> int:
        if isinstance(self.proposed_entry, dict):
            return int(self.proposed_entry.get("amount_fils", 0))
        return 0


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        "legal_entity_id",
        UUID(as_uuid=True),
        ForeignKey("legal_entities.id", ondelete="CASCADE"),
        nullable=False,
    )
    customer_number: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    name_ar: Mapped[str | None] = mapped_column(String(255), nullable=True)
    trn: Mapped[str | None] = mapped_column(String(15), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="AED")
    credit_limit_base: Mapped[int] = mapped_column(BigInteger, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        "legal_entity_id",
        UUID(as_uuid=True),
        ForeignKey("legal_entities.id", ondelete="CASCADE"),
        nullable=False,
    )
    vendor_number: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    name_ar: Mapped[str | None] = mapped_column(String(255), nullable=True)
    trn: Mapped[str | None] = mapped_column(String(15), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="AED")
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=30)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
