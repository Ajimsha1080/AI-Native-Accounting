"""Enterprise RAG Answering Pipeline Orchestrator with Bounded Correction Loop.

Executes the full 15-stage answering workflow:
Input Validation -> Context Resolution -> Intent Classification ->
Query Rewriting -> Hybrid Retrieval -> RRF -> Reranking ->
Sufficiency Assessment -> Bounded Retrieval Correction -> Context Assembly ->
Answer Synthesis -> Grounding Verification -> Citation Validation -> Safe Output.
"""

import uuid
from typing import Any

from app.ai.rag.citation_validator import validate_citations
from app.ai.rag.classifier import classify_query
from app.ai.rag.context_assembly import assemble_context
from app.ai.rag.context_resolution import resolve_conversation_context
from app.ai.rag.fusion import reciprocal_rank_fusion
from app.ai.rag.grounding import verify_grounding
from app.ai.rag.hybrid_retriever import HybridRetriever
from app.ai.rag.input_validation import normalize_and_validate_input
from app.ai.rag.query_rewriter import rewrite_query_conditionally
from app.ai.rag.reranker import rerank_passages
from app.ai.rag.schemas import (
    ChatMessage,
    QueryIntent,
    SufficiencyStatus,
    TelemetryRecord,
)
from app.ai.rag.sufficiency import assess_evidence_sufficiency
from app.ai.rag.synthesis import STATUTORY_DISCLAIMER, synthesize_answer
from app.ai.rag.telemetry import RagTelemetryCollector


class EnterpriseRagPipeline:
    """Master Pipeline for Enterprise Statutory Accounting RAG."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key
        self.retriever = HybridRetriever()

    def answer_question(
        self,
        question: str,
        tenant_id: str,
        history: list[ChatMessage] | None = None,
        category: str | None = None,
    ) -> dict[str, Any]:
        """Executes the full enterprise RAG answering workflow with bounded correction loops."""
        correlation_id = f"rag-{uuid.uuid4().hex[:12]}"
        telemetry = RagTelemetryCollector(correlation_id=correlation_id, tenant_id=tenant_id)
        retries_count = 0

        # Stage 1: Input Validation and Sanitization
        validated = normalize_and_validate_input(question, tenant_id)
        if not validated.is_safe:
            return {
                "question": question,
                "answerEn": "Query was flagged for safety review. Please rephrase your question using standard accounting terminology.",
                "answerAr": "تم تصنيف الاستعلام للمراجعة الأمنية. يرجى إعادة صياغة السؤال باستخدام مصطلحات محاسبية قياسية.",
                "citations": [],
                "disclaimer": STATUTORY_DISCLAIMER,
                "isGuarded": True,
                "intent": QueryIntent.AMBIGUOUS_UNSUPPORTED.value,
                "sufficiency": SufficiencyStatus.INSUFFICIENT.value,
            }

        cleaned_query = validated.cleaned_query

        # Stage 2: Conversation Context Resolution
        resolved_ctx = resolve_conversation_context(cleaned_query, history)
        query_for_retrieval = resolved_ctx.resolved_query

        # Stage 3: Intent Classification
        classification = classify_query(query_for_retrieval)

        # Stage 3a: Financial Action Guardrail
        if classification.intent == QueryIntent.FINANCIAL_ACTION:
            return {
                "question": question,
                "answerEn": "Financial posting, closing, and reconciliation actions require authorized application workflows and segregation-of-duties approval. The AI answering pipeline cannot execute direct ledger mutations.",
                "answerAr": "تتطلب عمليات الترحيل المالي والإقفال والتسوية صلاحيات تشغيلية واعتماداً وفق مبدأ فصل المهام. لا يمكن لمنظومة الذكاء الاصطناعي إجراء قيود محاسبية مباشرة.",
                "citations": [],
                "disclaimer": STATUTORY_DISCLAIMER,
                "isGuarded": True,
                "intent": classification.intent.value,
                "sufficiency": SufficiencyStatus.SUFFICIENT.value,
            }

        # Stage 3b: Financial Calculation Guardrail -> Live accounting data must use deterministic SQL
        if classification.intent == QueryIntent.FINANCIAL_CALCULATION:
            return {
                "question": question,
                "answerEn": "Authoritative financial balances, trial balance totals, and tax sums are calculated deterministically from the general ledger database. Please view the Reports & Dashboard section for live balances with zero vector estimation.",
                "answerAr": "يتم احتساب الأرصدة المالية الرسمية ومجاميع ميزان المراجعة والضرائب بشكل حتمي من قاعدة بيانات دفتر الأستاذ العام. يرجى الرجوع لقسم التقارير ولوحة القيادة للاطلاع على الأرصدة الدقيقة دون تقدير تقريبي.",
                "citations": [],
                "disclaimer": STATUTORY_DISCLAIMER,
                "isGuarded": True,
                "intent": classification.intent.value,
                "sufficiency": SufficiencyStatus.SUFFICIENT.value,
            }

        # Stage 4: Conditional Query Rewriting
        rewriting = rewrite_query_conditionally(
            original_query=query_for_retrieval,
            intent=classification.intent,
            detected_identifiers=classification.detected_identifiers,
        )

        # Stage 5: Hybrid Retrieval (Dense Semantic + Sparse BM25)
        candidates = self.retriever.retrieve(
            query=rewriting.search_query,
            tenant_id=tenant_id,
            category=category or classification.target_category,
            top_k=8,
        )

        # Stage 6: Reciprocal Rank Fusion (RRF)
        fused = reciprocal_rank_fusion(
            ranked_lists=[candidates.dense_candidates, candidates.sparse_candidates],
            k=60,
            top_k=6,
        )

        # Stage 7: Domain Accounting Reranking
        reranked = rerank_passages(
            original_query=cleaned_query,
            candidates=fused,
            top_n=4,
        )

        # Stage 8: Evidence Sufficiency Assessment
        sufficiency = assess_evidence_sufficiency(
            query=cleaned_query,
            passages=reranked,
            intent=classification.intent.value,
        )

        # Stage 8b: Bounded Retrieval Correction Loop (1 retry attempt)
        if sufficiency.status == SufficiencyStatus.INSUFFICIENT and retries_count == 0:
            retries_count += 1
            # Expand search broadly across corpus categories
            fallback_candidates = self.retriever.retrieve(
                query=cleaned_query,
                tenant_id=tenant_id,
                category=None,
                top_k=10,
            )
            fused = reciprocal_rank_fusion(
                ranked_lists=[
                    fallback_candidates.dense_candidates,
                    fallback_candidates.sparse_candidates,
                ],
                k=60,
                top_k=6,
            )
            reranked = rerank_passages(
                original_query=cleaned_query,
                candidates=fused,
                top_n=4,
            )
            sufficiency = assess_evidence_sufficiency(
                query=cleaned_query,
                passages=reranked,
                intent=classification.intent.value,
            )

        # If still insufficient or ambiguous, abstain gracefully
        if sufficiency.status == SufficiencyStatus.INSUFFICIENT or not reranked:
            return {
                "question": question,
                "answerEn": "Available UAE statutory decrees and documentation do not contain sufficient evidence to answer this question accurately without speculating.",
                "answerAr": "لا تحتوي المراسيم والوثائق القانونية المتاحة على أدلة كافية للإجابة على هذا السؤال بدقة دون تكهن.",
                "citations": [],
                "disclaimer": STATUTORY_DISCLAIMER,
                "isGuarded": True,
                "intent": classification.intent.value,
                "sufficiency": SufficiencyStatus.INSUFFICIENT.value,
            }

        # Stage 9: Context Assembly with XML Data Boundaries
        assembled = assemble_context(passages=reranked, max_tokens=1500)

        # Stage 10: LLM Answer Synthesis
        uncertainty_note = (
            "Multiple provisions apply depending on specific facts."
            if sufficiency.status == SufficiencyStatus.CONFLICTING
            else None
        )
        synthesized = synthesize_answer(
            question=cleaned_query,
            passages=assembled.selected_passages,
            api_key=self.api_key,
            uncertainty_note=uncertainty_note,
        )

        # Stage 11: Grounding and Claim Verification
        grounding = verify_grounding(
            claims=synthesized.extracted_claims,
            evidence_passages=assembled.selected_passages,
        )

        # Stage 12: Citation Validation
        citations_result = validate_citations(
            claims=grounding.grounded_claims,
            evidence_passages=assembled.selected_passages,
        )

        # Stage 13: Telemetry Recording
        telemetry.record_and_log(
            TelemetryRecord(
                correlation_id=correlation_id,
                tenant_id=tenant_id,
                intent=classification.intent,
                original_query=question,
                rewritten_query=rewriting.search_query if rewriting.was_rewritten else None,
                retrieval_count=len(candidates.dense_candidates)
                + len(candidates.sparse_candidates),
                rrf_count=len(fused),
                reranked_count=len(reranked),
                sufficiency_status=sufficiency.status,
                claims_count=len(synthesized.extracted_claims),
                grounded_claims_count=len(grounding.grounded_claims),
                citations_count=len(citations_result.validated_citations),
                abstained=False,
                correction_retries=retries_count,
                total_latency_ms=0.0,
            )
        )

        # Format validated citations for API response
        formatted_citations = [
            {
                "citationId": vc.citation_id,
                "chunkId": vc.chunk_id,
                "lawReference": vc.law_reference,
                "titleEn": vc.title_en,
                "titleAr": vc.title_ar,
                "statutoryAuthority": vc.statutory_authority,
                "relevanceScore": vc.relevance_score,
            }
            for vc in citations_result.validated_citations
        ]

        return {
            "question": question,
            "answerEn": synthesized.answer_en,
            "answerAr": synthesized.answer_ar,
            "citations": formatted_citations,
            "disclaimer": synthesized.disclaimer,
            "isGuarded": True,
            "intent": classification.intent.value,
            "sufficiency": sufficiency.status.value,
            "groundingScore": grounding.grounding_score,
            "modelUsed": synthesized.model_used,
            "uncertaintyLevel": synthesized.uncertainty_level,
            "correlationId": correlation_id,
        }
