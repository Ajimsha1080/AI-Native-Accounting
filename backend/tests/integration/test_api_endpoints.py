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


@pytest.mark.asyncio
async def test_payroll_wps_and_ops_endpoints():
    transport = ASGITransport(app=app)
    token = create_session_jwt(
        user_id="00000000-0000-0000-0000-000000000001",
        tenant_id="00000000-0000-0000-0000-000000000001",
        email="cfo@alnoor.ae",
        role="owner",
    )
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Payroll WPS GET & POST
        res_wps = await client.get("/api/v1/payroll/wps", headers=headers)
        assert res_wps.status_code == 200
        wps_data = res_wps.json()
        assert wps_data["wpsCompliant"] is True
        assert "SCR" in wps_data["sifSample"]

        res_dispatch = await client.post(
            "/api/v1/payroll/wps",
            json={"action": "DISPATCH", "salaryMonth": "2026-03"},
            headers=headers,
        )
        assert res_dispatch.status_code == 200
        assert res_dispatch.json()["status"] == "DISPATCHED"

        # 2. Ops Console
        res_ops = await client.get("/api/v1/ops/console", headers=headers)
        assert res_ops.status_code == 200
        assert res_ops.json()["console"]["subscription"]["planTier"] == "ENTERPRISE"

        # 3. Fixed Assets
        res_fa = await client.get("/api/v1/assets/fixed", headers=headers)
        assert res_fa.status_code == 200
        assert len(res_fa.json()["assets"]) > 0

        # 4. IFRS Leases & Revenue
        res_ifrs = await client.get("/api/v1/ifrs/revenue-leases", headers=headers)
        assert res_ifrs.status_code == 200
        assert "contracts" in res_ifrs.json()

        # 5. E-Invoicing Queue Retry
        res_einv = await client.post(
            "/api/v1/einvoicing/queue",
            json={"messageId": "msg-001", "action": "RETRY"},
            headers=headers,
        )
        assert res_einv.status_code == 200
        assert res_einv.json()["newStatus"] == "ACCEPTED"
