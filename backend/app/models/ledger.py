import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import JSON, BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, String
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
        UUID(as_uuid=True), ForeignKey("legal_entities.id", ondelete="CASCADE"), nullable=False
    )
    period_name: Mapped[str] = mapped_column(String(50), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="OPEN")  # OPEN, CLOSED, LOCKED
    locked_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Account(Base):
    __tablename__ = "chart_of_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("legal_entities.id", ondelete="CASCADE"), nullable=False
    )
    account_code: Mapped[str] = mapped_column(String(50), nullable=False)
    account_name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    account_name_ar: Mapped[str] = mapped_column(String(255), nullable=False)
    account_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
    classification: Mapped[str] = mapped_column(String(50), default="OPERATING")
    currency: Mapped[str] = mapped_column(String(3), default="AED")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    parent_account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("legal_entities.id", ondelete="CASCADE"), nullable=False
    )
    period_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounting_periods.id"), nullable=False
    )
    entry_number: Mapped[str] = mapped_column(String(100), nullable=False)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    entry_type: Mapped[str] = mapped_column(
        String(50), default="STANDARD"
    )  # STANDARD, ADJUSTING, CLOSING, REVERSING
    narration: Mapped[str] = mapped_column(String(1000), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="POSTED")  # DRAFT, POSTED, VOID
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    posted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    hash_chain: Mapped[str | None] = mapped_column(String(64), nullable=True)

    lines: Mapped[list["JournalLine"]] = relationship(
        "JournalLine", back_populates="journal", cascade="all, delete-orphan"
    )


class JournalLine(Base):
    __tablename__ = "journal_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    journal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chart_of_accounts.id"), nullable=False
    )
    line_number: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # DEBIT, CREDIT
    amount_fils: Mapped[int] = mapped_column(
        BigInteger, nullable=False
    )  # Strict integer minor units
    vat_rate: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # SR_5, ZR_0, EX_0, RCM_5, OUT_OF_SCOPE
    vat_amount_fils: Mapped[int] = mapped_column(BigInteger, default=0)
    trn: Mapped[str | None] = mapped_column(String(15), nullable=True)
    emirate: Mapped[str | None] = mapped_column(String(50), nullable=True)

    journal: Mapped["JournalEntry"] = relationship("JournalEntry", back_populates="lines")
    account: Mapped["Account"] = relationship("Account")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(100), nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    previous_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("legal_entities.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    customer_name: Mapped[str] = mapped_column(String(255), default="Standard Customer")
    invoice_number: Mapped[str] = mapped_column(String(100), nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="AED")
    subtotal_fils: Mapped[int] = mapped_column(BigInteger, nullable=False)
    vat_total_fils: Mapped[int] = mapped_column(BigInteger, nullable=False)
    total_fils: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="ISSUED"
    )  # DRAFT, ISSUED, PAID, CANCELLED
    einvoice_status: Mapped[str] = mapped_column(String(50), default="CLEARED")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class VendorBill(Base):
    __tablename__ = "vendor_bills"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("legal_entities.id", ondelete="CASCADE"), nullable=False
    )
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    vendor_name: Mapped[str] = mapped_column(String(255), nullable=False)
    bill_number: Mapped[str] = mapped_column(String(100), nullable=False)
    bill_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="AED")
    subtotal_fils: Mapped[int] = mapped_column(BigInteger, nullable=False)
    vat_total_fils: Mapped[int] = mapped_column(BigInteger, nullable=False)
    total_fils: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="PENDING"
    )  # PENDING, APPROVED, PAID, REJECTED
    approval_tier: Mapped[str] = mapped_column(String(50), default="APPROVED")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class BankStatementLine(Base):
    __tablename__ = "bank_statement_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("legal_entities.id", ondelete="CASCADE"), nullable=False
    )
    line_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    amount_fils: Mapped[int] = mapped_column(BigInteger, nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # DEBIT, CREDIT
    status: Mapped[str] = mapped_column(
        String(20), default="UNMATCHED"
    )  # UNMATCHED, MATCHED, RECONCILED
    matched_journal_line_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )


class AiProposal(Base):
    __tablename__ = "ai_proposals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("legal_entities.id", ondelete="CASCADE"), nullable=False
    )
    proposal_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # INVOICE_EXTRACTION, RECONCILIATION, ADJUSTING_ENTRY
    proposed_entry: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    explanation_en: Mapped[str] = mapped_column(String(2000), nullable=False)
    explanation_ar: Mapped[str] = mapped_column(String(2000), nullable=False)
    confidence_score: Mapped[int] = mapped_column(Integer, default=95)
    statutory_citation: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="PENDING"
    )  # PENDING, APPROVED, REJECTED
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
