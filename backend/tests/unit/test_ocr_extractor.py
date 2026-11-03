import io

import pytest
from httpx import ASGITransport, AsyncClient

from app.ai.ocr_extractor import InvoiceOcrExtractor, is_valid_uae_trn, parse_decimal_to_fils
from app.main import app


def test_parse_decimal_to_fils():
    assert parse_decimal_to_fils("1000.50") == 100050
    assert parse_decimal_to_fils("AED 1,250.75") == 125075
    assert parse_decimal_to_fils(500) == 50000
    assert parse_decimal_to_fils(None) == 0


def test_is_valid_uae_trn():
    assert is_valid_uae_trn("100234567800003") is True
    assert is_valid_uae_trn("100-2345-6780-0003") is True
    assert is_valid_uae_trn("200234567800003") is False  # Must start with 100
    assert is_valid_uae_trn("100123") is False  # Too short


def test_deterministic_ocr_parsing():
    sample_invoice_text = """
    TAX INVOICE / فاتورة ضريبية
    Supplier: Gulf Cloud Infrastructure LLC / شركة بنية السحابة الخليجية
    TRN: 100456789000003
    Invoice No: INV-2026-9921
    Date: 2026-10-18
    Currency: AED
    Subtotal: 2,000.00
    VAT (5%): 100.00
    Total: 2,100.00
    """
    res = InvoiceOcrExtractor.deterministic_parse(
        raw_text=sample_invoice_text,
        document_id="doc-test-123",
        filename="gulf_cloud_invoice.txt",
    )
    assert res.vendorTrn == "100456789000003"
    assert res.isTrnValid is True
    assert res.invoiceNumber == "INV-2026-9921"
    assert res.subtotalFils == 200000
    assert res.vatTotalFils == 10000
    assert res.totalFils == 210000
    assert res.isMathValid is True
    assert res.requiresHumanReview is False
    assert res.confidenceScore >= 0.9


@pytest.mark.asyncio
async def test_api_ocr_extract_invoice():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        invoice_content = b"""
        TAX INVOICE
        Vendor: Emirates Logistics Solutions PJSC
        TRN: 100987654300003
        Invoice #: ELS-8812
        Date: 2026-10-25
        Subtotal: 5000.00
        VAT: 250.00
        Total: 5250.00
        """
        files = {"file": ("invoice_sample.txt", io.BytesIO(invoice_content), "text/plain")}
        res = await client.post("/api/v1/ai/ocr/extract-invoice", files=files)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["data"]["vendorTrn"] == "100987654300003"
        assert data["data"]["totalFils"] == 525000
        assert data["data"]["isMathValid"] is True
