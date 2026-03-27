"""Integration tests for the clients API.

Covers authentication enforcement, input validation, and happy-path
GET with mocked DB results for admin and customer views.
"""

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.guards import require_admin_user, require_customer_user
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


def _customer_identity() -> MeResponse:
    return MeResponse(
        user_id="u-customer",
        email="customer@test.com",
        role="customer",
        client_id="client-1",
    )


def _mock_db_conn_cursor():
    """Build a mock connection/cursor chain that routes can iterate."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.cursor.return_value = mock_cursor
    mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
    mock_cursor.__exit__ = MagicMock(return_value=False)
    return mock_conn, mock_cursor


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
    """TestClient with admin auth overrides."""
    admin = _admin_identity()
    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_current_user_claims] = lambda: "{}"
    app.dependency_overrides[require_admin_user] = lambda: admin
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def customer_client():
    """TestClient with customer auth overrides."""
    customer = _customer_identity()
    app.dependency_overrides[get_current_user] = lambda: customer
    app.dependency_overrides[get_current_user_claims] = lambda: "{}"
    app.dependency_overrides[require_customer_user] = lambda: customer
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# 1. GET /api/v1/clients/admin without auth -> 401/403
# ---------------------------------------------------------------------------

def test_list_admin_clients_without_auth_returns_401_or_403(unauthenticated_client):
    response = unauthenticated_client.get("/api/v1/clients/admin")
    assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# 2. GET /api/v1/clients/admin with admin auth + mocked DB -> 200
# ---------------------------------------------------------------------------

def test_list_admin_clients_returns_200_with_data(admin_client, mocker):
    mock_conn, mock_cursor = _mock_db_conn_cursor()

    mock_cursor.description = [
        ("id",), ("name",), ("address",), ("postal_code",),
        ("city_id",), ("city_name",), ("is_cms",),
        ("floor",), ("door_code",), ("phone",), ("email",),
        ("active",), ("lat",), ("lng",),
        ("account_invite_status",), ("account_invite_error",),
        ("account_invited_at",), ("city_real_name",),
    ]
    mock_cursor.fetchall.return_value = [
        (
            "cl-1", "Alice Dupont", "Rue Test 1", "1000",
            "city-1", "Lausanne", False,
            None, None, "+41791234567", "alice@test.com",
            True, 46.52, 6.63,
            None, None, None, "Lausanne",
        ),
        (
            "cl-2", "Bob Martin", "Rue Example 5", "1003",
            "city-1", "Lausanne", True,
            "2e", "1234", "+41799876543", "bob@test.com",
            True, 46.53, 6.64,
            "invited", None, None, "Lausanne",
        ),
    ]

    mocker.patch("app.routes.clients.get_db_connection", return_value=mock_conn)

    response = admin_client.get("/api/v1/clients/admin")
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2
    assert data[0]["id"] == "cl-1"
    assert data[0]["name"] == "Alice Dupont"
    assert data[1]["id"] == "cl-2"
    assert data[1]["city_real_name"] == "Lausanne"


# ---------------------------------------------------------------------------
# 3. POST /api/v1/clients with admin auth but missing required fields -> 422
# ---------------------------------------------------------------------------

def test_create_client_missing_required_fields_returns_422(admin_client):
    # ClientCreate requires: name, address, postal_code, city_id
    response = admin_client.post("/api/v1/clients", json={})
    assert response.status_code == 422


def test_create_client_missing_name_returns_422(admin_client):
    response = admin_client.post(
        "/api/v1/clients",
        json={
            "address": "Rue Test 1",
            "postal_code": "1000",
            "city_id": "city-1",
        },
    )
    assert response.status_code == 422


def test_create_client_missing_city_id_returns_422(admin_client):
    response = admin_client.post(
        "/api/v1/clients",
        json={
            "name": "Alice",
            "address": "Rue Test 1",
            "postal_code": "1000",
        },
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# 4. GET /api/v1/clients/me with customer auth + mocked DB -> 200
# ---------------------------------------------------------------------------

def test_get_my_client_returns_200(customer_client, mocker):
    mock_conn, mock_cursor = _mock_db_conn_cursor()

    mock_cursor.description = [
        ("id",), ("name",), ("address",), ("postal_code",),
        ("city_name",), ("city_id",), ("is_cms",),
        ("floor",), ("door_code",), ("phone",), ("email",),
        ("active",), ("lat",), ("lng",),
    ]
    mock_cursor.fetchone.return_value = (
        "client-1", "Alice Dupont", "Rue Test 1", "1000",
        "Lausanne", "city-1", False,
        None, None, "+41791234567", "alice@test.com",
        True, 46.52, 6.63,
    )

    mocker.patch("app.routes.clients.get_db_connection", return_value=mock_conn)

    response = customer_client.get("/api/v1/clients/me")
    assert response.status_code == 200

    data = response.json()
    assert data["id"] == "client-1"
    assert data["name"] == "Alice Dupont"
    assert data["city_name"] == "Lausanne"
