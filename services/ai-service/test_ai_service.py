"""
Automated Evaluation Suite for Python AI Extraction Service
"""

from main import extract_invoice_from_text, validate_uae_trn, OcrTextPayload

def test_validate_uae_trn():
    assert validate_uae_trn("100234567800003") is True
    assert validate_uae_trn("200234567800003") is False  # Must start with 100
    assert validate_uae_trn("100123") is False            # Too short
    assert validate_uae_trn(None) is False

def test_extract_invoice_from_bilingual_text():
    sample_ocr = """
    TAX INVOICE / فاتورة ضريبية
    Al Futtaim Group LLC
    TRN: 100234567800003
    Invoice No / رقم الفاتورة: INV-2026-DXB-99
    Date: 2026-02-20
    Total / المجموع: AED 10,500.00
    """
    res = extract_invoice_from_text(OcrTextPayload(raw_text=sample_ocr))

    assert res.vendor_trn == "100234567800003"
    assert res.is_trn_valid is True
    assert res.invoice_number == "INV-2026-DXB-99"
    assert res.total_aed == 10500.00
    assert res.vat_total_aed == 500.00
    assert res.subtotal_aed == 10000.00
    assert res.lines[0].proposed_vat_code == "SR_5"

if __name__ == "__main__":
    test_validate_uae_trn()
    test_extract_invoice_from_bilingual_text()
    print("Python AI Service Unit and Eval Tests Passed Successfully!")
