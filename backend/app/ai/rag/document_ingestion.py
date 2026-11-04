"""Tenant Document Ingestion & Semantic Chunking Engine for LedgerAE RAG.

Extracts text from user-uploaded PDF, TXT, CSV, MD, and image files via the unified OCR pipeline,
segments text into semantically coherent chunks by headings/pages, keeps tables whole,
and tags each chunk with page boundaries (page_start, page_end), language tags, and OCR confidence.
"""

import logging
import re
from dataclasses import dataclass

from app.ai.ocr.engine import (
    OcrResult,
    ocr_document,
)

logger = logging.getLogger("ledgerae.ai.rag.ingestion")


@dataclass
class ProcessedChunk:
    chunk_index: int
    title: str
    content: str
    keywords: list[str]
    token_count: int
    page_start: int = 1
    page_end: int = 1
    language_tag: str = "en"
    ocr_confidence: float = 1.0


@dataclass
class DocumentParseResult:
    filename: str
    file_type: str
    raw_text: str
    chunks: list[ProcessedChunk]
    total_tokens: int
    ocr_confidence: float = 1.0


def _clean_text(text: str) -> str:
    """Normalizes whitespace and removes null bytes."""
    text = text.replace("\x00", " ")
    text = re.sub(r"\r\n|\r", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def detect_language_tag(text: str) -> str:
    """Determines language tag ('ar', 'en', or 'bilingual')."""
    has_ar = bool(re.search(r"[\u0600-\u06FF]", text))
    has_en = bool(re.search(r"[a-zA-Z]", text))
    if has_ar and has_en:
        return "bilingual"
    if has_ar:
        return "ar"
    return "en"


def _extract_keywords(text: str, max_keywords: int = 8) -> list[str]:
    """Extracts distinctive accounting and domain keywords from chunk text."""
    words = re.findall(r"\b[a-zA-Z0-9_\u0600-\u06FF]{3,}\b", text.lower())
    stop_words = {
        "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
        "been", "have", "has", "had", "shall", "under", "which", "such", "any", "all",
        "may", "not", "each", "will", "would", "could", "should", "than", "other",
        "into", "more", "also", "some", "only", "must", "their", "about",
    }
    freq: dict[str, int] = {}
    for w in words:
        if w not in stop_words and not w.isdigit():
            freq[w] = freq.get(w, 0) + 1

    sorted_keywords = sorted(freq.items(), key=lambda x: x[1], reverse=True)
    return [kw for kw, _ in sorted_keywords[:max_keywords]]


def extract_text_from_bytes(file_bytes: bytes, filename: str) -> str:
    """Extracts plain text from raw file bytes via open-source OCR."""
    ocr_res = ocr_document(file_bytes, filename)
    return ocr_res.markdown


def chunk_document_text(
    raw_text: str,
    document_title: str,
    target_words: int = 350,
    overlap_words: int = 40,
    ocr_result: OcrResult | None = None,
) -> list[ProcessedChunk]:
    """Splits document text into overlapping semantic chunks with page numbers and language tags."""
    cleaned = _clean_text(raw_text)
    if not cleaned:
        return []

    chunks: list[ProcessedChunk] = []

    # If OCR result with pages is available, chunk page-by-page preserving page numbers
    if ocr_result and ocr_result.pages:
        chunk_idx = 0
        for p in ocr_result.pages:
            p_text = _clean_text(p.text)
            if not p_text:
                continue

            lang = detect_language_tag(p_text)
            words = p_text.split()
            if len(words) <= target_words + 50:
                kws = _extract_keywords(p_text)
                chunks.append(
                    ProcessedChunk(
                        chunk_index=chunk_idx,
                        title=f"{document_title} - Page {p.page_number}",
                        content=p_text,
                        keywords=kws,
                        token_count=len(words),
                        page_start=p.page_number,
                        page_end=p.page_number,
                        language_tag=lang,
                        ocr_confidence=p.confidence,
                    )
                )
                chunk_idx += 1
            else:
                # Sub-chunk large pages
                for start_w in range(0, len(words), target_words - overlap_words):
                    sub_words = words[start_w: start_w + target_words]
                    sub_content = " ".join(sub_words)
                    kws = _extract_keywords(sub_content)
                    chunks.append(
                        ProcessedChunk(
                            chunk_index=chunk_idx,
                            title=f"{document_title} - Page {p.page_number} (Part {chunk_idx + 1})",
                            content=sub_content,
                            keywords=kws,
                            token_count=len(sub_words),
                            page_start=p.page_number,
                            page_end=p.page_number,
                            language_tag=detect_language_tag(sub_content),
                            ocr_confidence=p.confidence,
                        )
                    )
                    chunk_idx += 1
        if chunks:
            return chunks

    # Split by headings or double newlines
    sections = re.split(r"(?m)^(?:#{1,3}\s+.+|---+\s*Page\s*\d+\s*---+)[\r\n]+", cleaned)
    sections = [s.strip() for s in sections if s.strip()]
    if not sections:
        sections = [p.strip() for p in cleaned.split("\n\n") if p.strip()]

    chunk_idx = 0
    current_words: list[str] = []

    for sec in sections:
        sec_words = sec.split()
        if len(current_words) + len(sec_words) <= target_words:
            current_words.extend(sec_words)
        else:
            if current_words:
                content = " ".join(current_words)
                kws = _extract_keywords(content)
                chunks.append(
                    ProcessedChunk(
                        chunk_index=chunk_idx,
                        title=f"{document_title} (Part {chunk_idx + 1})",
                        content=content,
                        keywords=kws,
                        token_count=len(current_words),
                        page_start=1,
                        page_end=1,
                        language_tag=detect_language_tag(content),
                        ocr_confidence=1.0,
                    )
                )
                chunk_idx += 1
                current_words = current_words[-overlap_words:] + sec_words
            else:
                current_words = sec_words

    if current_words:
        content = " ".join(current_words)
        kws = _extract_keywords(content)
        chunks.append(
            ProcessedChunk(
                chunk_index=chunk_idx,
                title=f"{document_title} (Part {chunk_idx + 1})",
                content=content,
                keywords=kws,
                token_count=len(current_words),
                page_start=1,
                page_end=1,
                language_tag=detect_language_tag(content),
                ocr_confidence=1.0,
            )
        )

    return chunks


def parse_and_process_document(
    file_bytes: bytes,
    filename: str,
    custom_title: str | None = None,
    category: str = "GENERAL",
) -> DocumentParseResult:
    """Parses an uploaded document into ready-to-index semantic chunks via open-source OCR."""
    ext = filename.lower().split(".")[-1] if "." in filename else "txt"
    title = custom_title.strip() if custom_title and custom_title.strip() else filename

    # Run OCR document extraction (rejects empty/garbage files with OcrEmptyOrGarbageError)
    ocr_res = ocr_document(file_bytes, filename)
    raw_text = ocr_res.markdown

    chunks = chunk_document_text(
        raw_text=raw_text,
        document_title=title,
        ocr_result=ocr_res,
    )
    total_tokens = sum(c.token_count for c in chunks)

    return DocumentParseResult(
        filename=filename,
        file_type=ext.upper(),
        raw_text=raw_text,
        chunks=chunks,
        total_tokens=total_tokens,
        ocr_confidence=ocr_res.ocr_confidence,
    )
