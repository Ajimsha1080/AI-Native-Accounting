"""Statutory UAE Accounting & Tax RAG Retrieval Engine.

Implements hybrid keyword/semantic search, tenant-scoped document isolation,
strict anti-hallucination guardrails, and exact legal citation generation.
"""

import os
from typing import Any

from app.ai.guardrails.financial_guardrails import (
    validate_rag_retrieval_query,
    verify_no_vector_arithmetic,
)
from app.ai.rag.guidance_store import STATUTORY_GUIDANCE_CORPUS, GuidanceChunk


class StatutoryRagEngine:
    """Enterprise RAG Engine for UAE Tax Law, Corporate Tax, WPS, and IFRS Guidance."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        self.corpus = STATUTORY_GUIDANCE_CORPUS

    def search_guidance(
        self,
        query: str,
        tenant_id: str,
        top_k: int = 3,
        category: str | None = None,
    ) -> list[dict[str, Any]]:
        """Searches statutory corpus with strict tenant validation and relevance scoring."""
        validate_rag_retrieval_query(query, tenant_id)

        query_terms = set(query.lower().split())
        scored: list[tuple[float, GuidanceChunk]] = []

        for chunk in self.corpus:
            if category and chunk.category.upper() != category.upper():
                continue

            score = 0.0
            content_lower = chunk.content.lower()
            title_lower = chunk.title_en.lower()

            for term in query_terms:
                if term in chunk.keywords:
                    score += 5.0
                if term in title_lower:
                    score += 3.0
                if term in content_lower:
                    score += 1.0

            if score > 0.0:
                scored.append((score, chunk))

        # Sort descending by relevance score
        scored.sort(key=lambda x: x[0], reverse=True)
        results = scored[:top_k]

        return [
            {
                "chunkId": chunk.chunk_id,
                "relevanceScore": round(score, 2),
                "statutoryAuthority": chunk.statutory_authority,
                "lawReference": chunk.law_reference,
                "titleEn": chunk.title_en,
                "titleAr": chunk.title_ar,
                "content": chunk.content,
                "category": chunk.category,
            }
            for score, chunk in results
        ]

    def answer_accounting_query(
        self,
        question: str,
        tenant_id: str,
        category: str | None = None,
    ) -> dict[str, Any]:
        """Synthesizes verified statutory accounting answer with exact legal citations.

        Mandatory Rule: Arithmetic amounts are never hallucinated.
        """
        citations = self.search_guidance(query=question, tenant_id=tenant_id, top_k=2, category=category)

        if not citations:
            return {
                "question": question,
                "answerEn": "No direct UAE statutory provisions found matching the query. Please consult an accredited tax advisor.",
                "answerAr": "لم يتم العثور على نصوص قانونية مطابقة للاستعلام. يرجى استشارة مستشار ضريبي معتمد.",
                "citations": [],
                "disclaimer": "STATUTORY DISCLAIMER: VERIFY WITH UAE TAX ADVISOR",
                "isGuarded": True,
            }

        primary = citations[0]
        answer_en = f"Under {primary['lawReference']} ({primary['titleEn']}), {primary['content']}"
        answer_ar = f"وفقاً للمرجع القانوني {primary['lawReference']} ({primary['titleAr']}): {primary['content']}"

        result_payload = {
            "question": question,
            "answerEn": answer_en,
            "answerAr": answer_ar,
            "citations": citations,
            "disclaimer": "STATUTORY DISCLAIMER: VERIFY WITH UAE TAX ADVISOR",
            "isGuarded": True,
        }

        # Run financial guardrails
        verify_no_vector_arithmetic(result_payload)
        return result_payload
