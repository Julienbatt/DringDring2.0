"""Integration tests for input validation on API endpoints.

Validates that FastAPI's query-parameter constraints (ge, le, pattern)
correctly reject invalid input with 422 responses.
"""

import pytest
from fastapi.testclient import TestClient

from app.core.guards import (
    require_admin_user,
    require_dispatch_user,
    require_super_admin,
)
from app.core.security import get_current_user, get_current_user_claims
from app.main import app
from app.schemas.me import MeResponse


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _admin_identity() -> MeResponse:
    return MeResponse(
        user_id="u-admin",
        email="admin@test.com",
        role="admin_region",
        admin_region_id="ar-1",
    )


def _super_admin_identity() -> MeResponse:
    return MeResponse(
        user_id="u-super",
        email="super@test.com",
        role="super_admin",
        admin_region_id="ar-1",
    )


def _dispatch_identity() -> MeResponse:
    return MeResponse(
        user_id="u-dispatch",
        email="dispatch@test.com",
        role="admin_region",
        admin_region_id="ar-1",
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def admin_client():
    """TestClient with admin auth overrides for settings endpoints."""
    admin = _admin_identity()
    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_current_user_claims] = lambda: "{}"
    app.dependency_overrides[require_admin_user] = lambda: admin
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def super_admin_client():
    """TestClient with super-admin auth overrides for user endpoints."""
    sa = _super_admin_identity()
    app.dependency_overrides[get_current_user] = lambda: sa
    app.dependency_overrides[get_current_user_claims] = lambda: "{}"
    app.dependency_overrides[require_super_admin] = lambda: sa
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def dispatch_client():
    """TestClient with dispatch auth overrides for dispatch endpoints."""
    dispatch = _dispatch_identity()
    app.dependency_overrides[get_current_user] = lambda: dispatch
    app.dependency_overrides[get_current_user_claims] = lambda: "{}"
    app.dependency_overrides[require_dispatch_user] = lambda: dispatch
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Settings: vat-rate month validation
# ---------------------------------------------------------------------------

def test_vat_rate_rejects_invalid_month(admin_client):
    response = admin_client.get("/api/v1/settings/vat-rate?month=invalid")
    assert response.status_code == 422


def test_vat_rate_rejects_partial_month(admin_client):
    response = admin_client.get("/api/v1/settings/vat-rate?month=2026")
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Users: page / per_page validation
# ---------------------------------------------------------------------------

def test_users_rejects_page_zero(super_admin_client):
    response = super_admin_client.get("/api/v1/users?page=0")
    assert response.status_code == 422


def test_users_rejects_page_negative(super_admin_client):
    response = super_admin_client.get("/api/v1/users?page=-5")
    assert response.status_code == 422


def test_users_rejects_per_page_too_large(super_admin_client):
    response = super_admin_client.get("/api/v1/users?per_page=9999")
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Dispatch: limit / offset validation
# ---------------------------------------------------------------------------

def test_dispatch_rejects_limit_zero(dispatch_client):
    response = dispatch_client.get("/api/v1/dispatch/deliveries?limit=0")
    assert response.status_code == 422


def test_dispatch_rejects_negative_offset(dispatch_client):
    response = dispatch_client.get("/api/v1/dispatch/deliveries?offset=-1")
    assert response.status_code == 422
