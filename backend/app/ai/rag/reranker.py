"""Accounting Domain-Specific Reranker.

Reranks candidate passages against the original user question using domain cross-scoring,
exact statutory article matching, and tax threshold alignment.
"""

import re

from app.ai.rag.schemas import RetrievedPassage


def rerank_passages(
    original_query: str,
    candidates: list[RetrievedPassage],
    top_n: int = 3,
) -> list[RetrievedPassage]:
    """Reranks candidates against the user's original question with domain-specific boosts."""
    if not candidates:
        return []

    q_lower = original_query.lower()
    query_words = set(re.findall(r"\b\w+\b", q_lower))

    STOPWORDS = {
        "what",
        "is",
        "the",
        "on",
        "in",
        "at",
        "for",
        "a",
        "an",
        "to",
        "of",
        "and",
        "do",
        "does",
        "how",
        "why",
        "about",
    }
    meaningful_query_words = {w for w in query_words if w not in STOPWORDS} or query_words

    reranked: list[tuple[float, RetrievedPassage]] = []

    for passage in candidates:
        content_lower = passage.content.lower()
        title_lower = passage.title_en.lower()
        law_lower = passage.law_reference.lower()

        # Base score from RRF or retrieval
        base_score = passage.score

        # Domain Feature 1: Exact article / decree citation match (+40%)
        article_match = re.search(r"article\s+\d+", q_lower)
        if article_match and article_match.group(0) in (law_lower + " " + content_lower):
            base_score += 0.40

        # Domain Feature 2: Exact Box reference match (+35%)
        box_match = re.search(r"box\s+(?:1[a-g]|[1-9]|1[0-4])", q_lower)
        if box_match and box_match.group(0) in content_lower:
            base_score += 0.35

        # Domain Feature 3: Monetary / threshold number match (+25%)
        numbers_in_query = re.findall(r"\b\d+(?:,\d+)?\b", original_query)
        for num in numbers_in_query:
            if num in passage.content or num in passage.title_en:
                base_score += 0.25

        # Domain Feature 4: Meaningful word overlap ratio
        content_words = set(
            re.findall(r"\b\w+\b", content_lower + " " + title_lower + " " + law_lower)
        )
        overlap = meaningful_query_words.intersection(content_words)
        overlap_ratio = len(overlap) / max(len(meaningful_query_words), 1)
        base_score += overlap_ratio * 0.40

        # Domain Feature 5: Category alignment (+15%)
        if passage.category.lower() in q_lower:
            base_score += 0.15

        reranked.append((base_score, passage))

    reranked.sort(key=lambda x: x[0], reverse=True)

    final_passages: list[RetrievedPassage] = []
    for rank, (score, p) in enumerate(reranked[:top_n], start=1):
        p.score = round(score, 4)
        p.source_rank = rank
        final_passages.append(p)

    return final_passages
