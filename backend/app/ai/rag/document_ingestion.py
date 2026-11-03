"""Tenant Document Ingestion & Semantic Chunking Engine for LedgerAE RAG.

Extracts text from user-uploaded PDF, TXT, CSV, MD, and JSON files,
segments text into clean, semantically coherent chunks with overlap,
and prepares them for tenant-isolated vector indexing and hybrid retrieval.
"""

import io
import logging
import re
from typing import NamedTuple

logger = logging.getLogger("ledgerae.ai.rag.ingestion")


class ProcessedChunk(NamedTuple):
    chunk_index: int
    title: str
    content: str
    keywords: list[str]
    token_count: int


class DocumentParseResult(NamedTuple):
    filename: str
    file_type: str
    raw_text: str
    chunks: list[ProcessedChunk]
    total_tokens: int


def _clean_text(text: str) -> str:
    """Normalizes whitespace and removes null bytes."""
    text = text.replace("\x00", " ")
    text = re.sub(r"\r\n|\r", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


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
    """Extracts plain text from raw file bytes based on file extension."""
    ext = filename.lower().split(".")[-1] if "." in filename else ""

    if ext == "pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(file_bytes))
            pages_text = []
            for i, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                if text.strip():
                    pages_text.append(f"--- Page {i + 1} ---\n{text}")
            extracted = "\n\n".join(pages_text)
            if extracted.strip():
                return extracted
        except Exception as exc:
            # Fallback to UTF-8 / latin-1 decoding if PDF parser fails
            logger.debug("PDF parser error, falling back to raw decoding: %s", exc)

    # Try UTF-8 decoding first, then latin-1
    try:
        return file_bytes.decode("utf-8", errors="replace")
    except Exception:
        return file_bytes.decode("latin-1", errors="replace")


def chunk_document_text(
    raw_text: str,
    document_title: str,
    target_words: int = 350,
    overlap_words: int = 40,
) -> list[ProcessedChunk]:
    """Splits document text into overlapping semantic chunks with keyword tags."""
    cleaned = _clean_text(raw_text)
    if not cleaned:
        return []

    # First split by paragraph or section breaks
    paragraphs = [p.strip() for p in cleaned.split("\n\n") if p.strip()]

    chunks: list[ProcessedChunk] = []
    current_words: list[str] = []
    chunk_idx = 0

    for para in paragraphs:
        para_words = para.split()
        if len(current_words) + len(para_words) <= target_words:
            current_words.extend(para_words)
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
                    )
                )
                chunk_idx += 1
                # Preserve overlap from tail of previous chunk
                current_words = current_words[-overlap_words:] + para_words
            else:
                current_words = para_words

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
            )
        )

    return chunks


def parse_and_process_document(
    file_bytes: bytes,
    filename: str,
    custom_title: str | None = None,
    category: str = "GENERAL",
) -> DocumentParseResult:
    """Parses an uploaded document into ready-to-index semantic chunks."""
    ext = filename.lower().split(".")[-1] if "." in filename else "txt"
    title = custom_title.strip() if custom_title and custom_title.strip() else filename

    raw_text = extract_text_from_bytes(file_bytes, filename)
    chunks = chunk_document_text(raw_text=raw_text, document_title=title)
    total_tokens = sum(c.token_count for c in chunks)

    return DocumentParseResult(
        filename=filename,
        file_type=ext.upper(),
        raw_text=raw_text,
        chunks=chunks,
        total_tokens=total_tokens,
    )
