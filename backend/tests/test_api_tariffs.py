"""Integration tests for the tariffs API.

Covers authentication enforcement, input validation, and a basic
happy-path GET with mocked DB results.
"""

import json
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.guards import require_admin_user, require_tariff_reader
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


def _tariff_reader_identity() -> MeResponse:
    return MeResponse(
        user_id="u-reader",
        email="reader@test.com",
        role="admin_region",
        admin_region_id="ar-1",
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def unauthenticated_client():
    """TestClient with NO auth overrides -- requests arrive unauthenticated."""
    app.dependency_overrides.clear()
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def admin_client():
    """TestClient with admin auth overrides for tariff write endpoints."""
    admin = _admin_identity()
    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_current_user_claims] = lambda: "{}"
    app.dependency_overrides[require_admin_user] = lambda: admin
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def reader_client(mocker):
    """TestClient with tariff-reader auth and a mocked DB connection."""
    reader = _tariff_reader_identity()
    app.dependency_overrides[get_current_user] = lambda: reader
    app.dependency_overrides[get_current_user_claims] = lambda: "{}"
    app.dependency_overrides[require_tariff_reader] = lambda: reader

    # Build a mock connection/cursor chain that the route can iterate.
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.cursor.return_value = mock_cursor
    mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
    mock_cursor.__exit__ = MagicMock(return_value=False)

    # Return two sample tariff rows.
    mock_cursor.fetchall.return_value = [
        ("grid-1", "Standard", "ar-1", "v-1", "bags_price",
         {"ranges": [{"min": 1, "max": 5, "price": 3}]},
         {"client": 0.5, "shop": 0.5}),
        ("grid-2", "Premium", "ar-1", "v-2", "order_amount",
         {"ranges": [{"min": 0, "max": 100, "price": 5}]},
         {"client": 0.6, "shop": 0.4}),
    ]

    mocker.patch("app.routes.tariffs.get_db_connection", return_value=mock_conn)

    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Auth enforcement
# ---------------------------------------------------------------------------

def test_create_tariff_without_auth_returns_401_or_403(unauthenticated_client):
    response = unauthenticated_client.post(
        "/api/v1/tariffs",
        json={
            "name": "Test",
            "rule_type": "bags_price",
            "rule": {"ranges": []},
            "share": {"client": 0.5, "shop": 0.5},
        },
    )
    assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

def test_create_tariff_with_invalid_body_returns_422(admin_client):
    # Missing required fields: name, rule_type, rule, share.
    response = admin_client.post("/api/v1/tariffs", json={})
    assert response.status_code == 422


def test_create_tariff_missing_name_returns_422(admin_client):
    response = admin_client.post(
        "/api/v1/tariffs",
        json={
            "rule_type": "bags_price",
            "rule": {"ranges": []},
            "share": {"client": 0.5},
        },
    )
    assert response.status_code == 422


def test_create_tariff_missing_rule_returns_422(admin_client):
    response = admin_client.post(
        "/api/v1/tariffs",
        json={
            "name": "Test",
            "rule_type": "bags_price",
            "share": {"client": 0.5},
        },
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Happy-path read
# ---------------------------------------------------------------------------

def test_list_tariffs_returns_200_with_data(reader_client):
    response = reader_client.get("/api/v1/tariffs")
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2
    assert data[0]["id"] == "grid-1"
    assert data[0]["name"] == "Standard"
    assert data[1]["id"] == "grid-2"
    assert data[1]["name"] == "Premium"
