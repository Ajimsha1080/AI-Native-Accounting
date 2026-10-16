import pytest
from httpx import ASGITransport, AsyncClient

from app.ai.guardrails.financial_guardrails import (
    FinancialGuardrailViolation,
    validate_rag_retrieval_query,
    verify_no_vector_arithmetic,
)
from app.ai.rag.retrieval import StatutoryRagEngine
from app.core.security import create_session_jwt
from app.main import app


def test_rag_retrieval_vat_rcm_citation():
    engine = StatutoryRagEngine()
    results = engine.search_guidance(
        query="reverse charge mechanism on foreign imported services",
        tenant_id="00000000-0000-0000-0000-000000000001",
        top_k=1,
    )
    assert len(results) == 1
    top_hit = results[0]
    assert "Article 48" in top_hit["lawReference"]
    assert "Box 3" in top_hit["content"]
    assert top_hit["category"] == "VAT"


def test_rag_retrieval_corporate_tax_and_qfzp():
    engine = StatutoryRagEngine()
    results = engine.search_guidance(
        query="Qualifying Free Zone Person de-minimis 5% or 5,000,000",
        tenant_id="00000000-0000-0000-0000-000000000001",
        category="CORPORATE_TAX",
        top_k=1,
    )
    assert len(results) == 1
    assert "QFZP" in results[0]["titleEn"]
    assert "5,000,000" in results[0]["content"]


def test_rag_guardrails_prevent_invalid_query_and_tenant():
    with pytest.raises(FinancialGuardrailViolation) as exc_tenant:
        validate_rag_retrieval_query("VAT rules", tenant_id="")
    assert exc_tenant.value.code == "INVALID_TENANT"

    with pytest.raises(FinancialGuardrailViolation) as exc_short:
        validate_rag_retrieval_query("hi", tenant_id="00000000-0000-0000-0000-000000000001")
    assert exc_short.value.code == "QUERY_TOO_SHORT"


def test_financial_guardrails_reject_non_integer_money():
    with pytest.raises(FinancialGuardrailViolation) as exc_money:
        verify_no_vector_arithmetic({"computedResultFils": 150.50})  # Float rejected
    assert exc_money.value.code == "INVALID_FINANCIAL_TYPE"

    # Valid integer minor units pass
    verify_no_vector_arithmetic({"computedResultFils": 15050})


@pytest.mark.asyncio
async def test_ai_rag_endpoints_via_fastapi():
    transport = ASGITransport(app=app)
    token = create_session_jwt(
        user_id="00000000-0000-0000-0000-000000000001",
        tenant_id="00000000-0000-0000-0000-000000000001",
        email="cfo@alnoor.ae",
        role="owner",
    )
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Statutory search
        res_search = await client.post(
            "/api/v1/ai/rag/search",
            json={"query": "End of service gratuity Article 51 calculation", "topK": 2},
            headers=headers,
        )
        assert res_search.status_code == 200
        search_data = res_search.json()
        assert search_data["success"] is True
        assert len(search_data["results"]) > 0
        assert "Article 51" in search_data["results"][0]["lawReference"]

        # 2. Assistant query with citation lineage
        res_query = await client.post(
            "/api/v1/ai/assistant/query",
            json={"question": "What is the VAT rate on client entertainment expenses?"},
            headers=headers,
        )
        assert res_query.status_code == 200
        ans = res_query.json()["data"]
        assert "VERIFY WITH UAE TAX ADVISOR" in ans["disclaimer"]
        assert len(ans["citations"]) > 0
