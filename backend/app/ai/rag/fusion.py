"""Reciprocal Rank Fusion (RRF) for Combining Dense and Sparse Search Lists.

Formula:
    RRF_score(d) = sum_r (1 / (k + rank_r(d)))
where k = 60 is the standard smoothing constant.
"""

from app.ai.rag.schemas import RetrievedPassage


def reciprocal_rank_fusion(
    ranked_lists: list[list[RetrievedPassage]],
    k: int = 60,
    top_k: int = 5,
) -> list[RetrievedPassage]:
    """Combines multiple ranked candidate lists into a unified ranking using Reciprocal Rank Fusion."""
    if not ranked_lists:
        return []

    scores: dict[str, float] = {}
    passage_map: dict[str, RetrievedPassage] = {}
    provenance_map: dict[str, dict[str, int]] = {}

    for list_idx, passage_list in enumerate(ranked_lists):
        for rank, passage in enumerate(passage_list, start=1):
            chunk_id = passage.chunk_id
            if chunk_id not in passage_map:
                passage_map[chunk_id] = passage
                provenance_map[chunk_id] = {}

            # Update RRF score
            rrf_addition = 1.0 / (k + rank)
            scores[chunk_id] = scores.get(chunk_id, 0.0) + rrf_addition
            provenance_map[chunk_id][f"list_{list_idx}_rank"] = rank

    # Sort descending by merged RRF score
    sorted_ids = sorted(scores.keys(), key=lambda cid: scores[cid], reverse=True)

    fused_results: list[RetrievedPassage] = []
    for rank, cid in enumerate(sorted_ids[:top_k], start=1):
        p = passage_map[cid]
        fused = RetrievedPassage(
            chunk_id=p.chunk_id,
            content=p.content,
            law_reference=p.law_reference,
            statutory_authority=p.statutory_authority,
            title_en=p.title_en,
            title_ar=p.title_ar,
            category=p.category,
            score=round(scores[cid], 6),
            source_rank=rank,
            retrieval_method="RRF_FUSED",
            provenance={
                "rrf_score": scores[cid],
                "rankings": provenance_map[cid],
            },
        )
        fused_results.append(fused)

    return fused_results
