import pytest
from fastapi.testclient import TestClient

from app.core.security import get_current_user, get_current_user_claims
from app.main import app
from app.schemas.me import MeResponse


def _identity(role: str, **kwargs) -> MeResponse:
    return MeResponse(user_id="u1", email="u1@example.com", role=role, **kwargs)


@pytest.fixture
def auth_client():
    app.dependency_overrides[get_current_user] = lambda: MeResponse(
        user_id="u1",
        email="u1@example.com",
    )
    app.dependency_overrides[get_current_user_claims] = lambda: "{}"
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    ("path", "identity"),
    [
        ("/api/v1/dispatch/deliveries", _identity("shop", shop_id="s1")),
        ("/api/v1/reports/city-billing?month=2026-02", _identity("admin_region", admin_region_id="ar1")),
        ("/api/v1/reports/hq-billing?month=2026-02", _identity("shop", shop_id="s1")),
        ("/api/v1/billing/documents?month=2026-02", _identity("hq", hq_id="hq1")),
    ],
)
def test_endpoints_reject_unauthorized_roles(auth_client, mocker, path, identity):
    mock_resolve_identity = mocker.patch("app.core.guards.resolve_identity")
    mock_resolve_identity.return_value = identity

    response = auth_client.get(path)

    assert response.status_code == 403


def test_dispatch_endpoint_allows_dispatch_role_then_validates_context(auth_client, mocker):
    mock_resolve_identity = mocker.patch("app.core.guards.resolve_identity")
    mock_resolve_identity.return_value = _identity("courier", can_dispatch=True)

    response = auth_client.get("/api/v1/dispatch/deliveries")

    assert response.status_code == 400
    assert response.json()["detail"] == "Courier admin region missing"


def test_billing_documents_requires_authentication():
    with TestClient(app) as client:
        response = client.get("/api/v1/billing/documents?month=2026-02")

    assert response.status_code == 403
    assert response.json()["detail"] == "Not authenticated"
