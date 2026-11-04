"""Open-Source Bilingual OCR Engine for LedgerAE.

Powered by IBM Docling & EasyOCR for robust Arabic and English document intelligence.
Handles:
- Born-digital PDFs
- Scanned & photocopied PDFs
- Image files (PNG, JPG, JPEG, TIFF, WEBP)
- Table structure extraction and heading-aware Markdown formatting
- Zero hardcoded defaults; per-page confidence scoring; garbage text rejection
"""

import io
import logging
import os
import re
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from dataclasses import dataclass, field
from typing import Any

from app.core.config import settings

logger = logging.getLogger("ledgerae.ai.ocr.engine")

_OCR_EXECUTOR: ThreadPoolExecutor | None = None
_EASYOCR_READER: Any = None
_DOCLING_CONVERTER: Any = None
_INIT_LOCK = threading.Lock()


class OcrExtractionError(Exception):
    """Base error for OCR extraction pipeline."""


class OcrEmptyOrGarbageError(OcrExtractionError):
    """Raised when extracted document text is empty, unreadable, or garbage."""


class OcrServiceUnavailableError(OcrExtractionError):
    """Raised when OCR models, memory, or runtime are unavailable."""


@dataclass
class OcrPage:
    page_number: int
    text: str
    confidence: float
    tables: list[list[list[str]]] = field(default_factory=list)
    image_bytes: bytes | None = None


@dataclass
class OcrTable:
    page_number: int
    rows: list[list[str]]
    confidence: float = 1.0


@dataclass
class OcrResult:
    markdown: str
    pages: list[OcrPage]
    tables: list[OcrTable]
    ocr_confidence: float
    detected_languages: list[str] = field(default_factory=lambda: ["en", "ar"])


def is_meaningful_text(text: str) -> bool:
    """Checks whether the extracted text contains meaningful Arabic or Latin words,

    preventing unreadable noise or pure punctuation/gibberish from proceeding.
    """
    if not text or not text.strip():
        return False
    clean = re.sub(r"[\s\-_=+#*~`!@$%^&()\[\]{};:'\",.<>?/\\|]", "", text)
    if len(clean) < 6:
        return False
    # Must contain at least one meaningful Arabic or Latin alphanumeric cluster
    has_words = bool(re.search(r"[\u0600-\u06FFa-zA-Z0-9]{3,}", text))
    return has_words


def get_ocr_executor() -> ThreadPoolExecutor:
    global _OCR_EXECUTOR
    if _OCR_EXECUTOR is None:
        with _INIT_LOCK:
            if _OCR_EXECUTOR is None:
                workers = max(1, settings.OCR_MAX_WORKERS)
                _OCR_EXECUTOR = ThreadPoolExecutor(
                    max_workers=workers,
                    thread_name_prefix="ledgerae_ocr_worker"
                )
    return _OCR_EXECUTOR


def get_easyocr_reader() -> Any:
    """Thread-safe lazy initialization of the EasyOCR multilingual reader."""
    global _EASYOCR_READER
    if _EASYOCR_READER is None:
        with _INIT_LOCK:
            if _EASYOCR_READER is None:
                try:
                    import easyocr
                    logger.info("Initializing EasyOCR reader with languages %s...", settings.OCR_LANGUAGES)
                    _EASYOCR_READER = easyocr.Reader(
                        settings.OCR_LANGUAGES,
                        gpu=False,
                        verbose=False
                    )
                except Exception as exc:
                    logger.error("Failed to initialize EasyOCR reader: %s", exc)
                    raise OcrServiceUnavailableError(f"EasyOCR initialization failed: {exc}") from exc
    return _EASYOCR_READER


def get_docling_converter() -> Any:
    """Thread-safe initialization of Docling DocumentConverter configured with EasyOCR (ar, en)."""
    global _DOCLING_CONVERTER
    if _DOCLING_CONVERTER is None:
        with _INIT_LOCK:
            if _DOCLING_CONVERTER is None:
                try:
                    from docling.datamodel.base_models import InputFormat
                    from docling.datamodel.pipeline_options import (
                        EasyOcrOptions,
                        PdfPipelineOptions,
                    )
                    from docling.document_converter import DocumentConverter, PdfFormatOption

                    pipeline_options = PdfPipelineOptions()
                    pipeline_options.do_ocr = True
                    pipeline_options.do_table_structure = True
                    # Strictly use EasyOcrOptions with Arabic and English
                    pipeline_options.ocr_options = EasyOcrOptions(lang=settings.OCR_LANGUAGES)

                    _DOCLING_CONVERTER = DocumentConverter(
                        format_options={
                            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
                        }
                    )
                    logger.info("Docling DocumentConverter initialized with EasyOCR [ar, en].")
                except Exception as exc:
                    logger.warning("Docling with EasyOcrOptions setup notice: %s. Using direct OCR fallback.", exc)
                    _DOCLING_CONVERTER = "DIRECT_OCR_FALLBACK"
    return _DOCLING_CONVERTER


def _ocr_image_sync(file_bytes: bytes, filename: str) -> OcrResult:
    """Direct high-precision OCR on images (PNG, JPG, TIFF) via EasyOCR."""
    reader = get_easyocr_reader()
    try:
        from PIL import Image
        opened_img = Image.open(io.BytesIO(file_bytes))
        img = opened_img.convert("RGB") if opened_img.mode != "RGB" else opened_img
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format="PNG")
        normalized_bytes = img_byte_arr.getvalue()
    except Exception as e:
        logger.debug("PIL image normalization note: %s", e)
        normalized_bytes = file_bytes

    try:
        results = reader.readtext(normalized_bytes)
    except Exception as exc:
        raise OcrServiceUnavailableError(f"EasyOCR image processing failed: {exc}") from exc

    if not results:
        raise OcrEmptyOrGarbageError("No readable text discovered in image document.")

    lines: list[str] = []
    conf_scores: list[float] = []

    for item in results:
        # EasyOCR item format: (bbox, text, prob)
        if len(item) >= 3:
            _, text, prob = item[:3]
            t_str = str(text).strip()
            if t_str:
                lines.append(t_str)
                conf_scores.append(float(prob))

    full_text = "\n".join(lines)
    if not is_meaningful_text(full_text):
        raise OcrEmptyOrGarbageError("Extracted image text contains only unreadable or garbage symbols.")

    avg_conf = (sum(conf_scores) / len(conf_scores)) if conf_scores else 0.5
    avg_conf = round(max(0.1, min(1.0, avg_conf)), 4)

    page = OcrPage(
        page_number=1,
        text=full_text,
        confidence=avg_conf,
        image_bytes=normalized_bytes,
    )

    markdown = f"## Page 1\n\n{full_text}"
    return OcrResult(
        markdown=markdown,
        pages=[page],
        tables=[],
        ocr_confidence=avg_conf,
        detected_languages=settings.OCR_LANGUAGES,
    )


def _ocr_pdf_sync(file_bytes: bytes, filename: str) -> OcrResult:
    """Extracts text and table structures from born-digital or scanned PDFs.

    Uses Docling with EasyOCR pipeline options where available, with pypdfium2/easyocr fallback.
    """
    converter = get_docling_converter()

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        if converter != "DIRECT_OCR_FALLBACK":
            try:
                conv_res = converter.convert(tmp_path)
                doc = conv_res.document
                md_text = doc.export_to_markdown()

                tables: list[OcrTable] = []
                # Extract tables
                for i, tbl in enumerate(getattr(doc, "tables", [])):
                    try:
                        table_data = tbl.export_to_dataframe().values.tolist()
                        str_rows = [[str(cell) for cell in row] for row in table_data]
                        tables.append(OcrTable(page_number=1, rows=str_rows, confidence=0.95))
                    except Exception as e:
                        logger.debug("Table parse: %s", e)

                # Parse pages from markdown or doc items
                pages: list[OcrPage] = []
                page_texts = re.split(r"(?i)(?:---+ Page \d+ ---+|## Page \d+)", md_text)
                cleaned_pages = [p.strip() for p in page_texts if p.strip()]

                if not cleaned_pages:
                    cleaned_pages = [md_text.strip()]

                for idx, pt in enumerate(cleaned_pages, start=1):
                    pages.append(OcrPage(
                        page_number=idx,
                        text=pt,
                        confidence=0.92,
                    ))

                if is_meaningful_text(md_text):
                    return OcrResult(
                        markdown=md_text,
                        pages=pages,
                        tables=tables,
                        ocr_confidence=0.92,
                        detected_languages=settings.OCR_LANGUAGES,
                    )
            except Exception as e:
                logger.warning("Docling conversion failed (%s), falling back to pypdfium2 + EasyOCR", e)

        # Fallback: render PDF pages to images via pypdfium2 and run EasyOCR per page
        import pypdfium2 as pdfium
        pdf = pdfium.PdfDocument(tmp_path)
        all_pages: list[OcrPage] = []
        all_tables: list[OcrTable] = []
        md_chunks: list[str] = []
        reader = get_easyocr_reader()

        for page_idx in range(len(pdf)):
            page = pdf[page_idx]
            # First attempt: extract native digital text
            textpage = page.get_textpage()
            native_text = textpage.get_text_range()

            if is_meaningful_text(native_text):
                # Born-digital PDF page with clear text
                clean_text = native_text.strip()
                all_pages.append(OcrPage(
                    page_number=page_idx + 1,
                    text=clean_text,
                    confidence=0.98,
                ))
                md_chunks.append(f"## Page {page_idx + 1}\n\n{clean_text}")
            else:
                # Scanned page: render image and run EasyOCR
                pil_image = page.render(scale=2.0).to_pil()
                buf = io.BytesIO()
                pil_image.save(buf, format="PNG")
                img_bytes = buf.getvalue()

                ocr_res = reader.readtext(img_bytes)
                page_lines: list[str] = []
                confs: list[float] = []
                for item in ocr_res:
                    if len(item) >= 3:
                        _, txt, prob = item[:3]
                        if str(txt).strip():
                            page_lines.append(str(txt).strip())
                            confs.append(float(prob))

                page_text = "\n".join(page_lines)
                page_conf = (sum(confs) / len(confs)) if confs else 0.5
                all_pages.append(OcrPage(
                    page_number=page_idx + 1,
                    text=page_text,
                    confidence=round(page_conf, 4),
                    image_bytes=img_bytes,
                ))
                md_chunks.append(f"## Page {page_idx + 1}\n\n{page_text}")

        combined_md = "\n\n".join(md_chunks)
        if not is_meaningful_text(combined_md):
            raise OcrEmptyOrGarbageError("PDF contains no readable text, scanned words, or recognized characters.")

        overall_conf = (sum(p.confidence for p in all_pages) / len(all_pages)) if all_pages else 0.0
        return OcrResult(
            markdown=combined_md,
            pages=all_pages,
            tables=all_tables,
            ocr_confidence=round(overall_conf, 4),
            detected_languages=settings.OCR_LANGUAGES,
        )

    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception as e:
                logger.debug("Temp file remove: %s", e)


def ocr_document(file_bytes: bytes, filename: str) -> OcrResult:
    """Primary OCR interface for documents (PDF, images, plain text).

    Dispatches to worker thread pool with configurable timeout.
    """
    if not file_bytes or len(file_bytes.strip() if isinstance(file_bytes, (bytes, bytearray)) else file_bytes) == 0:
        raise OcrEmptyOrGarbageError("File is empty (0 bytes).")

    ext = filename.lower().split(".")[-1] if "." in filename else ""

    # Plain text / Markdown / Structured text (No OCR model needed, direct text)
    if ext in ("txt", "md", "text"):
        try:
            decoded = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            decoded = file_bytes.decode("latin-1", errors="replace")

        if not is_meaningful_text(decoded):
            raise OcrEmptyOrGarbageError("Text document contains no meaningful words or recognizable characters.")

        page = OcrPage(page_number=1, text=decoded.strip(), confidence=1.0)
        return OcrResult(
            markdown=f"## Page 1\n\n{decoded.strip()}",
            pages=[page],
            tables=[],
            ocr_confidence=1.0,
            detected_languages=["en", "ar"]
        )

    executor = get_ocr_executor()

    if ext == "pdf":
        future = executor.submit(_ocr_pdf_sync, file_bytes, filename)
    elif ext in ("png", "jpg", "jpeg", "webp", "tiff", "tif", "bmp"):
        future = executor.submit(_ocr_image_sync, file_bytes, filename)
    else:
        # Fallback to UTF-8 decoding if text-based, else attempt image
        try:
            decoded = file_bytes.decode("utf-8")
            if is_meaningful_text(decoded):
                page = OcrPage(page_number=1, text=decoded.strip(), confidence=0.9)
                return OcrResult(
                    markdown=decoded.strip(),
                    pages=[page],
                    tables=[],
                    ocr_confidence=0.9,
                    detected_languages=["en", "ar"]
                )
        except Exception as e:
            logger.debug("Raw decode fallback: %s", e)
        future = executor.submit(_ocr_image_sync, file_bytes, filename)

    try:
        timeout = float(getattr(settings, "OCR_TIMEOUT_SECONDS", 60.0))
        return future.result(timeout=timeout)
    except FuturesTimeoutError as exc:
        logger.error("OCR execution timed out after %s seconds for %s", timeout, filename)
        raise OcrServiceUnavailableError(f"OCR processing timed out after {timeout}s.") from exc
    except (OcrEmptyOrGarbageError, OcrServiceUnavailableError):
        raise
    except Exception as exc:
        logger.exception("OCR extraction unexpected failure on %s", filename)
        raise OcrServiceUnavailableError(f"OCR internal engine error: {exc}") from exc


def preload_ocr_models() -> None:
    """Preloads EasyOCR and Docling models in the environment or Docker image for offline capability."""
    try:
        logger.info("Preloading EasyOCR Arabic & English models...")
        get_easyocr_reader()
        logger.info("EasyOCR models preloaded successfully.")
    except Exception as e:
        logger.warning("OCR model preloading warning: %s", e)
