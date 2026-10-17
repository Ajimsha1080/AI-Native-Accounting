"""Context Assembly Module with Token Budgeting and Injection Defense.

Orders passages by relevance, trims to token limits, and encapsulates untrusted
retrieved documents inside XML boundaries to prevent prompt injection execution.
"""

from typing import NamedTuple

from app.ai.rag.schemas import RetrievedPassage


class AssembledContext(NamedTuple):
    context_text: str
    selected_passages: list[RetrievedPassage]
    total_token_estimate: int
    truncated: bool


def assemble_context(
    passages: list[RetrievedPassage],
    max_tokens: int = 1500,
) -> AssembledContext:
    """Assembles and formats candidate passages with token budgeting and XML data boundaries."""
    if not passages:
        return AssembledContext(
            context_text="",
            selected_passages=[],
            total_token_estimate=0,
            truncated=False,
        )

    # Deduplicate by chunk_id
    seen_ids: set[str] = set()
    deduped_passages: list[RetrievedPassage] = []
    for p in passages:
        if p.chunk_id not in seen_ids:
            seen_ids.add(p.chunk_id)
            deduped_passages.append(p)

    assembled_blocks: list[str] = []
    selected: list[RetrievedPassage] = []
    running_tokens = 0
    was_truncated = False

    for p in deduped_passages:
        # Rough token approximation (1 word ~ 1.3 tokens)
        estimated_chunk_tokens = int(len(p.content.split()) * 1.3) + 30

        if running_tokens + estimated_chunk_tokens > max_tokens:
            was_truncated = True
            break

        # XML encapsulation marks retrieved data as untrusted content
        xml_block = (
            f'<untrusted_document_chunk id="{p.chunk_id}" '
            f'law_reference="{p.law_reference}" '
            f'title_en="{p.title_en}" '
            f'category="{p.category}">\n'
            f"{p.content.strip()}\n"
            f"</untrusted_document_chunk>"
        )

        assembled_blocks.append(xml_block)
        selected.append(p)
        running_tokens += estimated_chunk_tokens

    final_context = "\n\n".join(assembled_blocks)

    return AssembledContext(
        context_text=final_context,
        selected_passages=selected,
        total_token_estimate=running_tokens,
        truncated=was_truncated,
    )
