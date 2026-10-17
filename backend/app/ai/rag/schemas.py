"""Enterprise RAG Schemas and Data Models.

Defines typed structures for classification, retrieval, fusion, reranking,
evidence sufficiency, context assembly, grounding verification, citations, and telemetry.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class QueryIntent(str, Enum):
    KNOWLEDGE_POLICY = "KNOWLEDGE_POLICY"  # Statutory laws, tax decrees, accounting standards
    DOCUMENT_SPECIFIC = "DOCUMENT_SPECIFIC"  # Specific invoice, contract, bill, vendor SLA
    FINANCIAL_CALCULATION = (
        "FINANCIAL_CALCULATION"  # Totals, balances, VAT arithmetic -> Deterministic SQL!
    )
    ACCOUNTING_EXPLANATION = (
        "ACCOUNTING_EXPLANATION"  # Debit/credit logic, chart of accounts rationale
    )
    FINANCIAL_ACTION = (
        "FINANCIAL_ACTION"  # Post journal, lock period -> requires auth & approval workflow
    )
    AMBIGUOUS_UNSUPPORTED = "AMBIGUOUS_UNSUPPORTED"  # Unclear or out-of-scope query


class SufficiencyStatus(str, Enum):
    SUFFICIENT = "SUFFICIENT"
    PARTIALLY_SUFFICIENT = "PARTIALLY_SUFFICIENT"
    INSUFFICIENT = "INSUFFICIENT"
    CONFLICTING = "CONFLICTING"


@dataclass(frozen=True)
class ChatMessage:
    role: str  # "user" | "assistant" | "system"
    content: str


@dataclass
class RetrievedPassage:
    chunk_id: str
    content: str
    law_reference: str
    statutory_authority: str
    title_en: str
    title_ar: str
    category: str
    score: float = 0.0
    source_rank: int = 0
    retrieval_method: str = "HYBRID"  # "SEMANTIC" | "KEYWORD" | "HYBRID" | "RRF"
    provenance: dict[str, Any] = field(default_factory=dict)
    matched_identifiers: list[str] = field(default_factory=list)


@dataclass
class FactualClaim:
    claim_text: str
    cited_chunk_ids: list[str]
    is_grounded: bool = False
    verification_method: str = "UNVERIFIED"
    contradiction_detected: bool = False
    confidence_score: float = 0.0


@dataclass
class ValidatedCitation:
    citation_id: str
    chunk_id: str
    law_reference: str
    title_en: str
    title_ar: str
    statutory_authority: str
    supported_claims: list[str] = field(default_factory=list)
    relevance_score: float = 0.0


@dataclass
class SufficiencyAssessment:
    status: SufficiencyStatus
    confidence: float
    reason: str
    missing_facts: list[str] = field(default_factory=list)
    conflicting_sources: list[str] = field(default_factory=list)
    recommended_action: str = "PROCEED"  # "PROCEED" | "RETRY_RETRIEVAL" | "CLARIFY" | "ABSTAIN"


@dataclass
class TelemetryRecord:
    correlation_id: str
    tenant_id: str
    intent: QueryIntent
    original_query: str
    rewritten_query: str | None
    retrieval_count: int
    rrf_count: int
    reranked_count: int
    sufficiency_status: SufficiencyStatus
    claims_count: int
    grounded_claims_count: int
    citations_count: int
    abstained: bool
    correction_retries: int
    total_latency_ms: float
    disclaimer_present: bool = True
