"""Evidence Filtering and Sufficiency Assessment Module.

Evaluates whether retrieved passages provide sufficient, authoritative, and non-contradictory
evidence to answer the user's question before answer synthesis is attempted.
"""

from app.ai.rag.schemas import RetrievedPassage, SufficiencyAssessment, SufficiencyStatus


def assess_evidence_sufficiency(
    query: str,
    passages: list[RetrievedPassage],
    intent: str,
) -> SufficiencyAssessment:
    """Evaluates factual completeness and absence of contradictions in retrieved evidence."""
    if not passages:
        return SufficiencyAssessment(
            status=SufficiencyStatus.INSUFFICIENT,
            confidence=0.0,
            reason="No relevant statutory or accounting documents were retrieved for this query.",
            missing_facts=["Statutory decree or contract text missing"],
            conflicting_sources=[],
            recommended_action="ABSTAIN",
        )

    q_lower = query.lower()
    top_score = passages[0].score if passages else 0.0

    # 1. Check for superficial similarity (weak score)
    if top_score < 0.10:
        return SufficiencyAssessment(
            status=SufficiencyStatus.INSUFFICIENT,
            confidence=0.30,
            reason="Retrieved passages have only superficial keyword overlap and do not establish the required legal rule.",
            missing_facts=["Authoritative statutory basis"],
            conflicting_sources=[],
            recommended_action="RETRY_RETRIEVAL",
        )

    # 2. Check for required domain specifics
    # E.g. query asks about "corporate tax" but only "VAT" is retrieved
    if "corporate tax" in q_lower and not any(p.category == "CORPORATE_TAX" for p in passages):
        return SufficiencyAssessment(
            status=SufficiencyStatus.INSUFFICIENT,
            confidence=0.40,
            reason="Query concerns UAE Corporate Tax (FDL 47), but retrieved evidence only covers other tax regimes.",
            missing_facts=["Corporate Tax law passages"],
            conflicting_sources=[],
            recommended_action="RETRY_RETRIEVAL",
        )

    if ("gratuity" in q_lower or "eosg" in q_lower) and not any(
        p.category == "PAYROLL" for p in passages
    ):
        return SufficiencyAssessment(
            status=SufficiencyStatus.INSUFFICIENT,
            confidence=0.40,
            reason="Query concerns UAE End of Service Gratuity (FDL 33), but no payroll law chunks were retrieved.",
            missing_facts=["Article 51 EOSG law text"],
            conflicting_sources=[],
            recommended_action="RETRY_RETRIEVAL",
        )

    # 3. Check for conflicting sources (e.g., standard rated 5% vs exempt 0% on same topic without qualification)
    conflicts: list[str] = []
    has_standard = any("5%" in p.content for p in passages)
    has_zero = any("0%" in p.content for p in passages)
    has_exempt = any("exempt" in p.content.lower() for p in passages)

    if (has_standard and (has_zero or has_exempt)) and not any(
        "unless" in p.content.lower() or "export" in p.content.lower() for p in passages
    ):
        conflicts.append("Potential conflict between standard rate and exemption/zero-rate rules")

    if conflicts:
        return SufficiencyAssessment(
            status=SufficiencyStatus.CONFLICTING,
            confidence=0.65,
            reason="Multiple statutory provisions apply different treatments depending on transaction conditions.",
            missing_facts=[],
            conflicting_sources=conflicts,
            recommended_action="PROCEED_WITH_DISCLOSURE",
        )

    # Sufficient
    return SufficiencyAssessment(
        status=SufficiencyStatus.SUFFICIENT,
        confidence=min(1.0, 0.70 + top_score * 0.3),
        reason="Evidence directly addresses query with authoritative statutory citation.",
        missing_facts=[],
        conflicting_sources=[],
        recommended_action="PROCEED",
    )
