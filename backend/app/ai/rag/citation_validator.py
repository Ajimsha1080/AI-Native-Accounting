"""Citation Validation Module.

Validates that every cited reference maps to a real, authorized, retrieved passage,
rejecting any fabricated or out-of-scope citations.
"""

from typing import NamedTuple

from app.ai.rag.schemas import FactualClaim, RetrievedPassage, ValidatedCitation


class CitationValidationResult(NamedTuple):
    is_valid: bool
    validated_citations: list[ValidatedCitation]
    rejected_citations: list[str]


def validate_citations(
    claims: list[FactualClaim],
    evidence_passages: list[RetrievedPassage],
) -> CitationValidationResult:
    """Validates and filters citations against the authenticated retrieved evidence set."""
    passage_map = {p.chunk_id: p for p in evidence_passages}
    validated: list[ValidatedCitation] = []
    rejected: list[str] = []

    # Map chunk_id -> supported claims
    chunk_to_claims: dict[str, list[str]] = {}

    for claim in claims:
        for cid in claim.cited_chunk_ids:
            if cid in passage_map:
                if cid not in chunk_to_claims:
                    chunk_to_claims[cid] = []
                chunk_to_claims[cid].append(claim.claim_text)
            else:
                rejected.append(cid)

    for cid, supported in chunk_to_claims.items():
        passage = passage_map[cid]
        vc = ValidatedCitation(
            citation_id=f"cit-{cid}",
            chunk_id=cid,
            law_reference=passage.law_reference,
            title_en=passage.title_en,
            title_ar=passage.title_ar,
            statutory_authority=passage.statutory_authority,
            supported_claims=supported,
            relevance_score=passage.score,
        )
        validated.append(vc)

    return CitationValidationResult(
        is_valid=len(rejected) == 0,
        validated_citations=validated,
        rejected_citations=rejected,
    )
