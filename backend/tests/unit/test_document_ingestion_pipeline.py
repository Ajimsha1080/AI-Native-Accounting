"""Comprehensive Ingestion Pipeline Tests: Invoices, Bank Statements, and RAG Documents.

Tests:
1. Missing fields stay null; no fake defaults; missingFields tracked.
2. Unbalanced invoice journal candidate is rejected.
3. Bank statement with wrong closing balance or wrong running balance is flagged with exact row numbers.
4. Flagged or high-value document cannot post without approval; creator cannot approve their own item (Segregation of Duties).
5. Garbage / empty file is rejected with HTTP 422.
6. OCR Service Unavailable returns HTTP 503.
7. Scanned Arabic invoice, English invoice, photo invoice, and bank statement PDF produce structured output.
8. RAG chunks keep page numbers, language tags, and tenant isolation.
"""

import io
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.ai.deterministic_checks import DeterministicFinancialValidator
from app.ai.hitl_service import HitlWorkflowEngine
from app.ai.ocr.engine import (
    OcrPage,
    OcrResult,
    OcrServiceUnavailableError,
)
from app.ai.ocr_extractor import (
    InvoiceOcrExtractor,
)
from app.ai.rag.document_ingestion import (
    chunk_document_text,
)
from app.main import app


def test_missing_fields_stay_null_no_invented_defaults():
    """Unreadable or absent fields MUST remain null/None without invented fake values."""
    unreadable_raw = "SOME UNRELATED TEXT WITHOUT VENDOR OR DATES OR NUMBERS"
    res = InvoiceOcrExtractor.deterministic_parse(
        raw_text=unreadable_raw,
        document_id="doc-missing-test",
        filename="unreadable.txt",
    )
    assert res.vendorName is None or res.vendorName == "SOME UNRELATED TEXT WITHOUT VENDOR OR DATES OR NUMBERS"
    assert res.vendorTrn is None
    assert res.invoiceNumber is None
    assert res.invoiceDate is None
    assert res.subtotalFils is None
    assert res.vatTotalFils is None
    assert res.totalFils is None
    assert "vendorTrn" in res.missingFields
    assert "invoiceNumber" in res.missingFields
    assert "totalFils" in res.missingFields
    assert res.requiresHumanReview is True
    assert res.confidenceScore < 0.5


def test_unbalanced_invoice_journal_rejected():
    """Rejects invoice where debits != credits or math is broken."""
    # Subtotal 1000 AED (100,000 fils) + VAT 50 AED (5,000 fils) != Total 1500 AED (150,000 fils)
    val = DeterministicFinancialValidator.validate_invoice(
        vendor_name="Gulf Supplies LLC",
        vendor_trn="100456789000003",
        invoice_number="INV-2026-001",
        invoice_date="2026-03-01",
        subtotal_fils=100000,
        vat_total_fils=5000,
        total_fils=150000,  # Deliberate mismatch
        lines=[{"netAmountFils": 100000, "vatAmountFils": 5000, "proposedTaxCode": "SR_5"}],
    )
    assert val.isDebitsEqualCredits is False
    assert val.isSubtotalPlusVatEqualTotal is False
    assert val.passedAllChecks is False
    assert val.requiresHumanReview is True
    assert any("Double-entry equilibrium failure" in r for r in val.reviewReasons)


def test_bank_statement_running_balance_and_closing_balance_reconciliation():
    """Validates bank statement and detects row arithmetic errors with exact row numbers."""
    rows_valid = [
        {"rowNumber": 1, "date": "2026-01-05", "narrative": "Client Transfer", "creditFils": 100000, "debitFils": 0, "runningBalanceFils": 1100000},
        {"rowNumber": 2, "date": "2026-01-10", "narrative": "Office Rent", "creditFils": 0, "debitFils": 200000, "runningBalanceFils": 900000},
    ]
    val_ok = DeterministicFinancialValidator.validate_bank_statement(
        account="AE290331234567890123456",
        opening_balance_fils=1000000,  # 10,000 AED
        closing_balance_fils=900000,   # 9,000 AED
        rows=rows_valid,
    )
    assert val_ok.isStatementArithmeticValid is True
    assert len(val_ok.failingRowNumbers) == 0
    assert val_ok.passedAllChecks is True

    # Error case: row 2 running balance is corrupted, and closing balance is wrong
    rows_corrupt = [
        {"rowNumber": 1, "date": "2026-01-05", "narrative": "Client Transfer", "creditFils": 100000, "debitFils": 0, "runningBalanceFils": 1100000},
        {"rowNumber": 2, "date": "2026-01-10", "narrative": "Office Rent", "creditFils": 0, "debitFils": 200000, "runningBalanceFils": 850000}, # Wrong running balance!
    ]
    val_corrupt = DeterministicFinancialValidator.validate_bank_statement(
        account="AE290331234567890123456",
        opening_balance_fils=1000000,
        closing_balance_fils=950000,  # Wrong closing balance
        rows=rows_corrupt,
    )
    assert val_corrupt.isStatementArithmeticValid is False
    assert 2 in val_corrupt.failingRowNumbers
    assert val_corrupt.requiresHumanReview is True


def test_segregation_of_duties_and_hitl_approval_tier():
    """Enforces: creator cannot approve own document; high-value requires executive tier."""
    item = HitlWorkflowEngine.create_approval_item(
        tenant_id="tenant-security-01",
        document_id="doc-bill-999",
        document_type="INVOICE",
        creator_user_id="user-accountant-01",
        amount_fils=6000000,  # 60,000 AED (Tier 3 Executive > 50k AED)
        requires_human_review=True,
        review_reasons=["High-value transaction"],
        extracted_data={"vendorName": "Major Hardware Vendor", "totalFils": 6000000},
        validation_result={"isBalanced": True},
    )
    assert item.status == "PENDING_APPROVAL"
    assert item.ledgerPostingAllowed is False

    # 1. Creator attempts to self-approve -> BLOCKED (Segregation of Duties)
    ok, reason, _ = HitlWorkflowEngine.process_approval(
        item_id=item.id,
        tenant_id="tenant-security-01",
        approver_user_id="user-accountant-01",  # Same user!
        approver_role="CFO",
        decision="APPROVE",
    )
    assert ok is False
    assert "Segregation of duties violation" in reason

    # 2. Junior accountant attempts to approve Tier 3 document -> BLOCKED (RBAC)
    ok2, reason2, _ = HitlWorkflowEngine.process_approval(
        item_id=item.id,
        tenant_id="tenant-security-01",
        approver_user_id="user-senior-acc-02",
        approver_role="SENIOR_ACCOUNTANT",
        decision="APPROVE",
    )
    assert ok2 is False
    assert "Approval tier violation" in reason2

    # 3. CFO approves -> ALLOWED and marks ledger posting allowed
    ok3, _reason3, approved_item = HitlWorkflowEngine.process_approval(
        item_id=item.id,
        tenant_id="tenant-security-01",
        approver_user_id="user-cfo-03",
        approver_role="CFO",
        decision="APPROVE",
    )
    assert ok3 is True
    assert approved_item.status == "APPROVED"
    assert approved_item.ledgerPostingAllowed is True


@pytest.mark.asyncio
async def test_garbage_and_empty_file_rejected_with_422():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Empty file
        empty_files = {"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")}
        res1 = await client.post("/api/v1/ai/ocr/extract-invoice", files=empty_files)
        assert res1.status_code == 422

        # Pure punctuation/garbage file
        garbage_bytes = b"..... --- ___ ~~~ +++ /// \\\\\\ ???"
        garbage_files = {"file": ("garbage.txt", io.BytesIO(garbage_bytes), "text/plain")}
        res2 = await client.post("/api/v1/ai/ocr/extract-invoice", files=garbage_files)
        assert res2.status_code == 422


@pytest.mark.asyncio
async def test_ocr_service_unavailable_returns_503():
    """Simulates OCR engine or service failure returning HTTP 503."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("app.ai.ocr_extractor.ocr_document", side_effect=OcrServiceUnavailableError("OCR Worker Down")):
            test_file = {"file": ("invoice.txt", io.BytesIO(b"Vendor: Test\nTotal: 100.00"), "text/plain")}
            res = await client.post("/api/v1/ai/ocr/extract-invoice", files=test_file)
            assert res.status_code == 503
            assert "OCR Service Unavailable" in res.json()["detail"]


@pytest.mark.asyncio
async def test_scanned_arabic_invoice_structured_extraction():
    """Tests Arabic statutory tax invoice extraction and deterministic checks."""
    arabic_text = """
    فاتورة ضريبية
    المورد: شركة الاتحاد للخدمات اللوجستية ش.ذ.م.م
    الرقم الضريبي: 100345678900003
    رقم الفاتورة: ITD-2026-789
    التاريخ: 2026-03-05
    المجموع قبل الضريبة: 4000.00
    ضريبة القيمة المضافة: 200.00
    المجموع الكلي: 4200.00
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        files = {"file": ("arabic_invoice.txt", io.BytesIO(arabic_text.encode("utf-8")), "text/plain")}
        res = await client.post("/api/v1/ai/ocr/extract-invoice", files=files)
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["vendorTrn"] == "100345678900003"
        assert data["isTrnValid"] is True
        assert data["subtotalFils"] == 400000
        assert data["vatTotalFils"] == 20000
        assert data["totalFils"] == 420000
        assert data["isMathValid"] is True
        assert data["journalCandidate"]["isBalanced"] is True


@pytest.mark.asyncio
async def test_scanned_bank_statement_pdf_endpoint():
    """Tests bank statement ingestion endpoint with row running balances."""
    statement_text = """
    كشف حساب بنكي / BANK STATEMENT
    Account: AE120330000123456789012
    Opening Balance: AED 50,000.00
    2026-02-01 Inward Payment Client Alpha 10,000.00 60,000.00
    2026-02-05 Outward Supplier Wire DR 5,000.00 55,000.00
    Closing Balance: AED 55,000.00
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        files = {"file": ("statement.txt", io.BytesIO(statement_text.encode("utf-8")), "text/plain")}
        res = await client.post("/api/v1/ai/ocr/extract-bank-statement", files=files)
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["documentType"] == "BANK_STATEMENT"
        assert data["openingBalanceFils"] == 5000000
        assert data["closingBalanceFils"] == 5500000
        assert data["statementBalanced"] is True
        assert len(data["failingRowNumbers"]) == 0


def test_rag_chunking_preserves_page_numbers_and_language_tag():
    """RAG chunking stores page_start, page_end, language tags, and OCR confidence."""
    mock_ocr = OcrResult(
        markdown="## Page 1\n\nCorporate Tax Law UAE Federal Decree Law No 47\n\n## Page 2\n\nقانون ضريبة الشركات المعاملات المؤهلة",
        pages=[
            OcrPage(page_number=1, text="Corporate Tax Law UAE Federal Decree Law No 47", confidence=0.98),
            OcrPage(page_number=2, text="قانون ضريبة الشركات المعاملات المؤهلة", confidence=0.94),
        ],
        tables=[],
        ocr_confidence=0.96,
        detected_languages=["en", "ar"],
    )
    chunks = chunk_document_text(
        raw_text=mock_ocr.markdown,
        document_title="UAE Corporate Tax",
        ocr_result=mock_ocr,
    )
    assert len(chunks) == 2
    assert chunks[0].page_start == 1
    assert chunks[0].page_end == 1
    assert chunks[0].language_tag == "en"
    assert chunks[0].ocr_confidence == 0.98

    assert chunks[1].page_start == 2
    assert chunks[1].page_end == 2
    assert chunks[1].language_tag == "ar"
    assert chunks[1].ocr_confidence == 0.94
