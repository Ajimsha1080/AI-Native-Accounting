"""Conditional Query Rewriter for Precision RAG Retrieval.

Preserves the original user question, and selectively rewrites only when there
is demonstrable retrieval benefit (resolving conversational slang, acronyms, or missing legal terms).
"""

from typing import NamedTuple

from app.ai.rag.schemas import QueryIntent


class RewritingResult(NamedTuple):
    original_query: str
    search_query: str
    was_rewritten: bool
    expansion_terms: list[str]


ACRONYM_MAP = {
    "rcm": "Reverse Charge Mechanism Article 48",
    "eosg": "End of Service Gratuity Article 51",
    "qfzp": "Qualifying Free Zone Person Corporate Tax de-minimis",
    "sif": "Wages Protection System WPS salary file",
    "fta": "Federal Tax Authority",
    "rou": "Right of Use Asset IFRS 16",
}


def rewrite_query_conditionally(
    original_query: str,
    intent: QueryIntent,
    detected_identifiers: dict[str, str] | None = None,
) -> RewritingResult:
    """Conditionally produces a search-optimized query while preserving the original query."""
    # Never rewrite financial calculation or action queries
    if intent in (QueryIntent.FINANCIAL_CALCULATION, QueryIntent.FINANCIAL_ACTION):
        return RewritingResult(
            original_query=original_query,
            search_query=original_query,
            was_rewritten=False,
            expansion_terms=[],
        )

    words = original_query.lower().split()
    expansions: list[str] = []

    for word in words:
        clean_word = word.strip("?,.:;\"'")
        if clean_word in ACRONYM_MAP:
            expansions.append(ACRONYM_MAP[clean_word])

    # If simple clear question without acronyms, avoid rewriting
    if not expansions and len(words) >= 4:
        return RewritingResult(
            original_query=original_query,
            search_query=original_query,
            was_rewritten=False,
            expansion_terms=[],
        )

    # Build expanded search query
    rewritten_parts = [original_query]
    if expansions:
        rewritten_parts.extend(expansions)

    if detected_identifiers:
        for k, v in detected_identifiers.items():
            rewritten_parts.append(f"{k}: {v}")

    search_query = " ".join(rewritten_parts)
    return RewritingResult(
        original_query=original_query,
        search_query=search_query,
        was_rewritten=len(expansions) > 0 or bool(detected_identifiers),
        expansion_terms=expansions,
    )
