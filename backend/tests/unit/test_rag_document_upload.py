import io
import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core.security import create_session_jwt
from app.ai.rag.document_ingestion import (
    extract_text_from_bytes,
    chunk_document_text,
    parse_and_process_document,
)
from app.ai.rag.tenant_knowledge import (
    register_tenant_document_chunks,
    get_tenant_chunks,
    remove_tenant_document,
)
from app.ai.rag.hybrid_retriever import HybridRetriever


def test_document_chunking_and_keywords():
    sample_text = """
    MASTER SERVICES AND SLA AGREEMENT
    
    This Master Services Agreement is executed between Al Noor Holding LLC and Gulf Cloud Services.
    The customer agrees to pay standard AED 50,000 monthly retainer for dedicated cloud infrastructure.
    All payments are subject to 5% UAE VAT in accordance with Federal Decree-Law No. 8 of 2017.
    
    TERMINATION CLAUSE
    
    Either party may terminate this agreement with 30 days written notice. In the event of early termination,
    all unbilled cloud consumption charges shall become immediately payable.
    """
    parsed = parse_and_process_document(
        file_bytes=sample_text.encode("utf-8"),
        filename="SLA_Agreement_2026.txt",
        custom_title="Al Noor Cloud SLA Agreement",
        category="CONTRACT",
    )
    assert parsed.file_type == "TXT"
    assert len(parsed.chunks) >= 1
    chunk = parsed.chunks[0]
    assert "Al Noor" in chunk.title
    assert "termination" in [k.lower() for k in chunk.keywords] or "agreement" in [k.lower() for k in chunk.keywords]


def test_tenant_knowledge_registration_and_retrieval():
    tenant_a = str(uuid.uuid4())
    tenant_b = str(uuid.uuid4())
    doc_id = str(uuid.uuid4())

    sample_contract = """
    SPECIAL PROCUREMENT POLICY FOR DUBAI SUBSIDIARY
    All vendor expenses exceeding AED 15,000 require written sign-off from the regional Managing Director.
    Special concession discount of 12% applies to annual purchases with Emirates Logistics LLC.
    """
    parsed = parse_and_process_document(
        file_bytes=sample_contract.encode("utf-8"),
        filename="Dubai_Procurement_Policy.md",
        custom_title="Dubai Procurement Policy 2026",
        category="POLICY",
    )

    # Register for Tenant A only
    register_tenant_document_chunks(
        tenant_id=tenant_a,
        document_id=doc_id,
        document_title="Dubai Procurement Policy 2026",
        category="POLICY",
        chunks=parsed.chunks,
    )

    # Tenant A must retrieve it
    retriever_a = HybridRetriever()
    candidates_a = retriever_a.retrieve(
        query="What discount applies to Emirates Logistics purchases?",
        tenant_id=tenant_a,
        category="POLICY",
        top_k=5,
    )
    all_passages_a = candidates_a.dense_candidates + candidates_a.sparse_candidates
    found_a = [p for p in all_passages_a if "Emirates Logistics" in p.content]
    assert len(found_a) > 0
    assert found_a[0].statutory_authority == "Tenant Document Knowledge Base"

    # Tenant B MUST NOT see Tenant A's document (Strict Tenant Isolation)
    retriever_b = HybridRetriever()
    candidates_b = retriever_b.retrieve(
        query="What discount applies to Emirates Logistics purchases?",
        tenant_id=tenant_b,
        category="POLICY",
        top_k=5,
    )
    all_passages_b = candidates_b.dense_candidates + candidates_b.sparse_candidates
    found_b = [p for p in all_passages_b if "Emirates Logistics" in p.content]
    assert len(found_b) == 0

    # Clean up
    remove_tenant_document(tenant_id=tenant_a, document_id=doc_id)
    assert len(get_tenant_chunks(tenant_a)) == 0


@pytest.mark.asyncio
async def test_api_upload_list_and_delete_document():
    transport = ASGITransport(app=app)
    tenant_id = "00000000-0000-0000-0000-000000000001"
    token = create_session_jwt(
        user_id="00000000-0000-0000-0000-000000000001",
        tenant_id=tenant_id,
        email="cfo@alnoor.ae",
        role="owner",
    )
    headers = {"Authorization": f"Bearer {token}"}

    file_content = b"""
    AL NOOR HOLDING TAX RULING MEMO
    Under Ministerial Decision No. 73 of 2023 on Small Business Relief, the taxable person with revenue
    not exceeding AED 3,000,000 may elect for relief under Article 21 of Federal Decree-Law No. 47 of 2022.
    """

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Upload Document
        files = {
            "file": ("tax_ruling_memo.txt", io.BytesIO(file_content), "text/plain"),
        }
        data = {
            "category": "TAX_RULING",
            "title": "Al Noor Small Business Relief Memo",
        }
        res_upload = await client.post("/api/v1/ai/rag/documents/upload", headers=headers, files=files, data=data)
        assert res_upload.status_code == 201
        up_data = res_upload.json()
        assert up_data["success"] is True
        doc_id = up_data["document"]["id"]
        assert up_data["document"]["title"] == "Al Noor Small Business Relief Memo"
        assert up_data["document"]["chunkCount"] >= 1

        # 2. List Documents
        res_list = await client.get("/api/v1/ai/rag/documents", headers=headers)
        assert res_list.status_code == 200
        list_data = res_list.json()
        assert list_data["count"] >= 1
        found_doc = [d for d in list_data["documents"] if d["id"] == doc_id]
        assert len(found_doc) == 1

        # 3. Search RAG to verify retrieval of the uploaded document
        res_search = await client.post(
            "/api/v1/ai/rag/search",
            headers=headers,
            json={"query": "What revenue threshold applies to Small Business Relief?", "topK": 5},
        )
        assert res_search.status_code == 200
        search_data = res_search.json()
        results = search_data["results"]
        assert len(results) > 0

        # 4. Delete Document
        res_del = await client.delete(f"/api/v1/ai/rag/documents/{doc_id}", headers=headers)
        assert res_del.status_code == 200
        assert res_del.json()["success"] is True
