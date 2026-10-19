"""Unit and integration tests for LangSmith Enterprise Observability in LedgerAE."""

import pytest
from fastapi.testclient import TestClient

from app.ai.langsmith_client import langsmith_manager
from app.ai.llm_gateway import LiteLLMGateway
from app.core.config import settings
from app.core.security import create_session_jwt
from app.main import app


@pytest.fixture
def test_client():
    return TestClient(app)


@pytest.fixture
def auth_headers():
    token = create_session_jwt(
        user_id="00000000-0000-0000-0000-000000000001",
        email="cfo@group.ae",
        role="CFO",
        tenant_id="00000000-0000-0000-0000-000000000001",
    )
    return {"Authorization": f"Bearer {token}"}


def test_langsmith_manager_status():
    """Verifies default LangSmith manager status and configuration inspection."""
    status = langsmith_manager.get_status()
    assert "status" in status
    assert status["project"] == settings.LANGSMITH_PROJECT
    assert status["endpoint"] == settings.LANGSMITH_ENDPOINT
    assert isinstance(status["totalTracesRecorded"], int)


def test_langsmith_manager_callback_wiring():
    """Verifies wiring LangSmith callbacks into LiteLLM."""
    wired = langsmith_manager.wire_litellm_callbacks()
    assert wired is True
    status = langsmith_manager.get_status()
    assert status["litellmCallbackConfigured"] is True


def test_langsmith_manager_dispatch_test_trace():
    """Verifies synthetic test trace dispatch and telemetry counters."""
    initial_count = langsmith_manager.get_status()["totalTracesRecorded"]
    res = langsmith_manager.dispatch_test_trace(
        query="UAE VAT Article 48 Reverse Charge Verification",
        response="Reverse charge applied for cross-border B2B electronic services.",
        metadata={"category": "VAT201"},
    )

    assert res["success"] is True
    assert "traceId" in res
    assert res["project"] == settings.LANGSMITH_PROJECT
    assert res["latencyMs"] >= 0
    assert langsmith_manager.get_status()["totalTracesRecorded"] == initial_count + 1
    assert langsmith_manager.get_status()["lastTraceId"] == res["traceId"]


def test_langsmith_manager_check_connection():
    """Verifies connection health check in unconfigured/standby environment."""
    res = langsmith_manager.check_connection()
    assert res["success"] is True
    assert res["status"] in ("STANDBY", "CONNECTED")
    assert res["project"] == settings.LANGSMITH_PROJECT


def test_litellm_gateway_attaches_langsmith_trace():
    """Verifies LiteLLMGateway generates and attaches a LangSmith trace ID."""
    gateway = LiteLLMGateway()
    response = gateway.generate_completion(
        prompt="Explain UAE Federal Decree-Law No. 47 of 2022 Corporate Tax Rate",
    )

    assert response.metrics.langsmithTraceId is not None
    assert len(response.metrics.langsmithTraceId) > 10
    assert response.is_guarded is True


def test_api_langsmith_status_endpoint(test_client, auth_headers):
    """Verifies GET /api/v1/ai/langsmith/status returns structured observability state."""
    resp = test_client.get("/api/v1/ai/langsmith/status", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "data" in data
    assert data["data"]["project"] == settings.LANGSMITH_PROJECT


def test_api_langsmith_check_connection_endpoint(test_client, auth_headers):
    """Verifies POST /api/v1/ai/langsmith/check-connection tests connectivity."""
    resp = test_client.post("/api/v1/ai/langsmith/check-connection", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "data" in data
    assert "status" in data["data"]


def test_api_langsmith_test_trace_endpoint(test_client, auth_headers):
    """Verifies POST /api/v1/ai/langsmith/test-trace creates a verified trace."""
    payload = {
        "query": "Test statutory audit inquiry for AED 50,000 entertainment expense",
        "response": "Under UAE CT Law, entertainment expenses are 50% non-deductible.",
    }
    resp = test_client.post("/api/v1/ai/langsmith/test-trace", json=payload, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "data" in data
    assert "traceId" in data["data"]
    assert data["data"]["project"] == settings.LANGSMITH_PROJECT
