"""Conversation Context Resolution Module.

Resolves anaphoric and conversational references ('that invoice', 'the previous voucher', 'their TRN')
using recent chat history, while keeping retrieval query minimal and focused.
"""

import re
from typing import NamedTuple

from app.ai.rag.schemas import ChatMessage


class ResolvedContext(NamedTuple):
    resolved_query: str
    referenced_entities: dict[str, str]
    was_modified: bool


# Identifier extraction patterns for UAE accounting entities
PATTERNS = {
    "invoice_number": re.compile(r"\b(INV-[A-Za-z0-9\-_]+|[A-Z]{3,5}-\d{4,8})\b", re.IGNORECASE),
    "voucher_number": re.compile(r"\b(JV-[A-Za-z0-9\-_]+|PV-[A-Za-z0-9\-_]+)\b", re.IGNORECASE),
    "trn": re.compile(r"\b(100\d{12})\b"),
    "account_code": re.compile(r"\b([1-5]\d{3,4})\b"),
    "period_id": re.compile(r"\b(202[4-9]-(?:Q[1-4]|\d{2}))\b"),
}


def resolve_conversation_context(
    current_query: str,
    history: list[ChatMessage] | None = None,
) -> ResolvedContext:
    """Scans history to resolve pronouns and implicit entity references."""
    if not history:
        return ResolvedContext(
            resolved_query=current_query,
            referenced_entities={},
            was_modified=False,
        )

    referenced_entities: dict[str, str] = {}

    # Scan history in reverse (most recent message first)
    for msg in reversed(history[-6:]):  # Last 6 messages maximum
        for entity_type, pattern in PATTERNS.items():
            if entity_type not in referenced_entities:
                match = pattern.search(msg.content)
                if match:
                    referenced_entities[entity_type] = match.group(1)

    resolved = current_query
    was_modified = False

    # Reference triggers
    lower_query = current_query.lower()

    if (
        any(phrase in lower_query for phrase in ["that invoice", "the invoice", "this invoice"])
        and "invoice_number" in referenced_entities
    ):
        inv = referenced_entities["invoice_number"]
        if inv.lower() not in lower_query:
            resolved = f"{resolved} (referencing invoice {inv})"
            was_modified = True

    if (
        any(phrase in lower_query for phrase in ["that voucher", "the entry", "the journal"])
        and "voucher_number" in referenced_entities
    ):
        vouch = referenced_entities["voucher_number"]
        if vouch.lower() not in lower_query:
            resolved = f"{resolved} (referencing voucher {vouch})"
            was_modified = True

    if (
        any(phrase in lower_query for phrase in ["their trn", "the trn", "tax number"])
        and "trn" in referenced_entities
    ):
        trn = referenced_entities["trn"]
        if trn not in lower_query:
            resolved = f"{resolved} (referencing TRN {trn})"
            was_modified = True

    if (
        any(phrase in lower_query for phrase in ["that period", "last quarter", "the quarter"])
        and "period_id" in referenced_entities
    ):
        period = referenced_entities["period_id"]
        if period.lower() not in lower_query:
            resolved = f"{resolved} (period {period})"
            was_modified = True

    return ResolvedContext(
        resolved_query=resolved,
        referenced_entities=referenced_entities,
        was_modified=was_modified,
    )
