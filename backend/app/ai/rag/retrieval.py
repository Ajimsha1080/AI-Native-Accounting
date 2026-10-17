"""Statutory UAE Accounting & Tax RAG Retrieval Engine.

Implements hybrid keyword/semantic search, Reciprocal Rank Fusion,
strict anti-hallucination guardrails, and exact legal citation generation.
"""

import os
from typing import Any

from app.ai.guardrails.financial_guardrails import (
    validate_rag_retrieval_query,
    verify_no_vector_arithmetic,
)
from app.ai.rag.fusion import reciprocal_rank_fusion
from app.ai.rag.guidance_store import STATUTORY_GUIDANCE_CORPUS, GuidanceChunk
from app.ai.rag.hybrid_retriever import HybridRetriever
from app.ai.rag.pipeline import EnterpriseRagPipeline
from app.ai.rag.reranker import rerank_passages
from app.ai.rag.schemas import ChatMessage


class StatutoryRagEngine:
    """Enterprise RAG Engine for UAE Tax Law, Corporate Tax, WPS, and IFRS Guidance."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        self.corpus: list[GuidanceChunk] = STATUTORY_GUIDANCE_CORPUS
        self.hybrid_retriever = HybridRetriever(self.corpus)
        self.pipeline = EnterpriseRagPipeline(api_key=self.api_key)

    def search_guidance(
        self,
        query: str,
        tenant_id: str,
        top_k: int = 3,
        category: str | None = None,
    ) -> list[dict[str, Any]]:
        """Searches statutory corpus using hybrid retrieval (Dense + Sparse BM25),

        Reciprocal Rank Fusion (RRF), and accounting domain reranking.
        """
        validate_rag_retrieval_query(query, tenant_id)

        # 1. Hybrid retrieval (dense + sparse)
        candidates = self.hybrid_retriever.retrieve(
            query=query,
            tenant_id=tenant_id,
            category=category,
            top_k=top_k * 3,
        )

        # 2. Reciprocal Rank Fusion (RRF)
        fused = reciprocal_rank_fusion(
            ranked_lists=[candidates.dense_candidates, candidates.sparse_candidates],
            k=60,
            top_k=top_k * 2,
        )

        # 3. Domain Reranking
        reranked = rerank_passages(
            original_query=query,
            candidates=fused,
            top_n=top_k,
        )

        return [
            {
                "chunkId": p.chunk_id,
                "relevanceScore": p.score,
                "statutoryAuthority": p.statutory_authority,
                "lawReference": p.law_reference,
                "titleEn": p.title_en,
                "titleAr": p.title_ar,
                "content": p.content,
                "category": p.category,
            }
            for p in reranked
        ]

    def answer_accounting_query(
        self,
        question: str,
        tenant_id: str,
        history: list[ChatMessage] | list[dict[str, str]] | None = None,
        category: str | None = None,
    ) -> dict[str, Any]:
        """Synthesizes verified statutory accounting answer with exact legal citations

        using the 15-stage enterprise answering workflow.
        """
        parsed_history: list[ChatMessage] = []
        if history:
            for item in history:
                if isinstance(item, ChatMessage):
                    parsed_history.append(item)
                elif isinstance(item, dict):
                    parsed_history.append(
                        ChatMessage(role=item.get("role", "user"), content=item.get("content", ""))
                    )

        result_payload = self.pipeline.answer_question(
            question=question,
            tenant_id=tenant_id,
            history=parsed_history,
            category=category,
        )

        # Verify zero floating-point arithmetic
        verify_no_vector_arithmetic(result_payload)
        return result_payload
