from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.ai.rag.retrieval import StatutoryRagEngine
from app.api.deps import get_current_user_claims

router = APIRouter(prefix="/ai", tags=["AI & RAG Services"])


class RagSearchRequest(BaseModel):
    query: str = Field(min_length=3, max_length=1000)
    category: str | None = None
    topK: int = Field(default=3, ge=1, le=10)


class AssistantQueryRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    category: str | None = None


@router.post("/rag/search")
async def search_statutory_guidance(
    req: RagSearchRequest,
    claims: dict[str, Any] = Depends(get_current_user_claims),
):
    engine = StatutoryRagEngine()
    results = engine.search_guidance(
        query=req.query,
        tenant_id=claims["tenant_id"],
        top_k=req.topK,
        category=req.category,
    )
    return {
        "success": True,
        "query": req.query,
        "results": results,
        "count": len(results),
        "disclaimer": "STATUTORY DISCLAIMER: VERIFY WITH UAE TAX ADVISOR",
    }


@router.post("/assistant/query")
async def query_ai_assistant(
    req: AssistantQueryRequest,
    claims: dict[str, Any] = Depends(get_current_user_claims),
):
    engine = StatutoryRagEngine()
    answer = engine.answer_accounting_query(
        question=req.question,
        tenant_id=claims["tenant_id"],
        category=req.category,
    )
    return {
        "success": True,
        "data": answer,
    }
