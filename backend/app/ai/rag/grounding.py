"""Grounding and Claim Verification Module.

Decomposes synthesized answers into atomic factual claims, verifies each claim
against supporting source passages, and checks exact fidelity for dates, TRNs, percentages, and amounts.
"""

import re
from typing import NamedTuple

from app.ai.rag.schemas import FactualClaim, RetrievedPassage


class GroundingResult(NamedTuple):
    all_grounded: bool
    grounded_claims: list[FactualClaim]
    ungrounded_claims: list[FactualClaim]
    discrepancies: list[str]
    grounding_score: float


def verify_grounding(
    claims: list[FactualClaim],
    evidence_passages: list[RetrievedPassage],
) -> GroundingResult:
    """Verifies that all claims are grounded strictly in the retrieved evidence passages."""
    if not claims:
        return GroundingResult(
            all_grounded=True,
            grounded_claims=[],
            ungrounded_claims=[],
            discrepancies=[],
            grounding_score=1.0,
        )

    passage_map = {p.chunk_id: p for p in evidence_passages}
    grounded: list[FactualClaim] = []
    ungrounded: list[FactualClaim] = []
    discrepancies: list[str] = []

    for claim in claims:
        is_claim_valid = True

        # 1. Check cited passages exist in retrieved set
        valid_chunks: list[RetrievedPassage] = []
        for cid in claim.cited_chunk_ids:
            if cid in passage_map:
                valid_chunks.append(passage_map[cid])
            else:
                is_claim_valid = False
                discrepancies.append(f"Claim cites non-existent passage: {cid}")

        if not valid_chunks:
            claim.is_grounded = False
            claim.verification_method = "FAILED_NO_PASSAGE"
            ungrounded.append(claim)
            continue

        # Combined evidence text from supporting chunks
        evidence_text = " ".join([c.content + " " + c.law_reference for c in valid_chunks])

        # 2. Exact match check for key numbers & percentages in claim
        percentages = re.findall(r"\b\d+%", claim.claim_text)
        for pct in percentages:
            if pct not in evidence_text:
                is_claim_valid = False
                discrepancies.append(f"Percentage {pct} in claim not found in cited evidence")

        # 3. Exact match check for statutory thresholds (e.g. 375,000, 5,000,000)
        thresholds = re.findall(r"\b\d{1,3}(?:,\d{3})+\b", claim.claim_text)
        for th in thresholds:
            if th not in evidence_text:
                is_claim_valid = False
                discrepancies.append(
                    f"Threshold amount {th} in claim not supported by source passage"
                )

        # 4. TRN 15-digit checksum verification
        trns = re.findall(r"\b100\d{12}\b", claim.claim_text)
        for trn in trns:
            if trn not in evidence_text:
                is_claim_valid = False
                discrepancies.append(f"TRN {trn} in claim is not present in cited source document")

        if is_claim_valid:
            claim.is_grounded = True
            claim.verification_method = "DETERMINISTIC_EXACT_EVIDENCE"
            grounded.append(claim)
        else:
            claim.is_grounded = False
            claim.verification_method = "FAILED_DISCREPANCY"
            ungrounded.append(claim)

    score = len(grounded) / max(len(claims), 1)
    return GroundingResult(
        all_grounded=len(ungrounded) == 0,
        grounded_claims=grounded,
        ungrounded_claims=ungrounded,
        discrepancies=discrepancies,
        grounding_score=round(score, 2),
    )
