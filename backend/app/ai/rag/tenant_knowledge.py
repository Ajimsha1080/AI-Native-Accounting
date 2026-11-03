"""Tenant Document Knowledge Store for LedgerAE RAG.

Manages tenant-isolated custom document chunks and provides clean conversion
to GuidanceChunk objects for hybrid retrieval, RRF, and citation verification.
"""

import uuid
from typing import Any

from app.ai.rag.document_ingestion import ProcessedChunk
from app.ai.rag.guidance_store import GuidanceChunk

# In-memory tenant chunks cache for high-throughput sub-millisecond retrieval
_TENANT_CHUNKS_REGISTRY: dict[str, list[GuidanceChunk]] = {}


def register_tenant_document_chunks(
    tenant_id: str,
    document_id: str,
    document_title: str,
    category: str,
    chunks: list[ProcessedChunk],
) -> list[GuidanceChunk]:
    """Converts and registers processed document chunks into GuidanceChunk instances."""
    guidance_chunks: list[GuidanceChunk] = []

    for chunk in chunks:
        chunk_id = f"tenant-doc-{document_id[:8]}-{chunk.chunk_index}"
        g_chunk = GuidanceChunk(
            chunk_id=chunk_id,
            statutory_authority="Tenant Document Knowledge Base",
            law_reference=f"User Document: {document_title}",
            title_en=chunk.title,
            title_ar=chunk.title,
            content=chunk.content,
            category=category.upper(),
            keywords=tuple(chunk.keywords),
        )
        guidance_chunks.append(g_chunk)

    if tenant_id not in _TENANT_CHUNKS_REGISTRY:
        _TENANT_CHUNKS_REGISTRY[tenant_id] = []

    # Filter out existing chunks for this document if re-uploading
    _TENANT_CHUNKS_REGISTRY[tenant_id] = [
        c for c in _TENANT_CHUNKS_REGISTRY[tenant_id]
        if not c.chunk_id.startswith(f"tenant-doc-{document_id[:8]}")
    ] + guidance_chunks

    return guidance_chunks


def get_tenant_chunks(tenant_id: str) -> list[GuidanceChunk]:
    """Retrieves all active in-memory guidance chunks for a specific tenant."""
    return _TENANT_CHUNKS_REGISTRY.get(tenant_id, [])


def remove_tenant_document(tenant_id: str, document_id: str) -> None:
    """Removes a document's chunks from the tenant's active knowledge cache."""
    if tenant_id in _TENANT_CHUNKS_REGISTRY:
        _TENANT_CHUNKS_REGISTRY[tenant_id] = [
            c for c in _TENANT_CHUNKS_REGISTRY[tenant_id]
            if not c.chunk_id.startswith(f"tenant-doc-{document_id[:8]}")
        ]
