import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import create_session_jwt
from app.main import app


@pytest.mark.asyncio
async def test_health_check_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "healthy"
        assert "FastAPI" in data["runtime"]

        res_v1 = await client.get("/api/v1/health")
        assert res_v1.status_code == 200


@pytest.mark.asyncio
async def test_unauthorized_access_fails_closed():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Attempt accessing protected ledger route without credentials
        res = await client.get("/api/v1/ledger/accounts")
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_unbalanced_journal_posting_rejected():
    transport = ASGITransport(app=app)
    # Generate valid test JWT
    token = create_session_jwt(
        user_id="00000000-0000-0000-0000-000000000001",
        tenant_id="00000000-0000-0000-0000-000000000001",
        email="cfo@alnoor.ae",
        role="owner",
    )

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers = {"Authorization": f"Bearer {token}"}
        payload = {
            "entity_id": "00000000-0000-0000-0000-000000000001",
            "period_id": "00000000-0000-0000-0000-000000000003",
            "entry_number": "JV-TEST-ERR",
            "entry_date": "2026-03-15",
            "narration": "Unbalanced Test",
            "lines": [
                {
                    "account_id": "00000000-0000-0000-0000-000000000010",
                    "description": "Debit",
                    "direction": "DEBIT",
                    "amount_fils": 100000,
                },
                {
                    "account_id": "00000000-0000-0000-0000-000000000020",
                    "description": "Credit",
                    "direction": "CREDIT",
                    "amount_fils": 99999,  # Unbalanced
                },
            ],
        }
        res = await client.post("/api/v1/ledger/journals", json=payload, headers=headers)
        assert res.status_code == 422
        err = res.json()
        assert err["detail"]["code"] == "UNBALANCED_JOURNAL"
