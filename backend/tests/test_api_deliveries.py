"""Integration tests for the deliveries API.

Covers authentication enforcement, input validation, and happy-path
GET/POST with mocked DB results for shop, courier, and customer views.
"""

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.guards import require_shop_user, require_courier_user, require_customer_user
from app.core.security import get_current_user, get_current_user_claims
from app.main import app
from app.schemas.me import MeResponse


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _shop_identity() -> MeResponse:
    return MeResponse(
        user_id="u-shop",
        email="shop@test.com",
        role="shop",
        shop_id="shop-1",
    )


def _courier_identity() -> MeResponse:
    return MeResponse(
        user_id="u-courier",
        email="courier@test.com",
        role="courier",
        courier_id="courier-1",
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
def shop_client():
    """TestClient with shop auth overrides."""
    shop = _shop_identity()
    app.dependency_overrides[get_current_user] = lambda: shop
    app.dependency_overrides[get_current_user_claims] = lambda: "{}"
    app.dependency_overrides[require_shop_user] = lambda: shop
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def courier_client():
    """TestClient with courier auth overrides."""
    courier = _courier_identity()
    app.dependency_overrides[get_current_user] = lambda: courier
    app.dependency_overrides[get_current_user_claims] = lambda: "{}"
    app.dependency_overrides[require_courier_user] = lambda: courier
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
# 1. POST /api/v1/deliveries/shop without auth -> 401/403
# ---------------------------------------------------------------------------

def test_create_shop_delivery_without_auth_returns_401_or_403(unauthenticated_client):
    response = unauthenticated_client.post(
        "/api/v1/deliveries/shop",
        json={
            "client_id": "00000000-0000-0000-0000-000000000001",
            "delivery_date": "2026-04-01",
            "time_window": "10:00-12:00",
            "bags": 2,
        },
    )
    assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# 2. POST /api/v1/deliveries/shop with shop auth but empty body -> 422
# ---------------------------------------------------------------------------

def test_create_shop_delivery_empty_body_returns_422(shop_client):
    response = shop_client.post("/api/v1/deliveries/shop", json={})
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# 3. GET /api/v1/deliveries/shop with shop auth + mocked DB -> 200
# ---------------------------------------------------------------------------

def test_list_shop_deliveries_returns_200(shop_client, mocker):
    mock_conn, mock_cursor = _mock_db_conn_cursor()

    # The route calls parse_month then executes two queries:
    # 1. Main delivery query   2. _is_period_frozen check
    mock_cursor.description = [
        ("delivery_id",), ("delivery_date",), ("client_id",),
        ("client_name",), ("address",), ("city_name",),
        ("time_window",), ("short_code",), ("bags",),
        ("order_amount",), ("basket_value",), ("is_cms",),
        ("notes",), ("status",), ("status_updated_at",),
        ("total_price",), ("share_admin_region",),
    ]
    mock_cursor.fetchall.return_value = [
        (
            "d-1", "2026-03-01", "c-1", "Alice", "Rue Test 1",
            "Lausanne", "10:00-12:00", "AB1", 2, 50.0, 60.0,
            False, None, "created", None, 5.0, 2.0,
        ),
    ]
    # _is_period_frozen calls fetchone
    mock_cursor.fetchone.return_value = None

    mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

    response = shop_client.get("/api/v1/deliveries/shop?month=2026-03")
    assert response.status_code == 200

    data = response.json()
    assert "rows" in data
    assert isinstance(data["rows"], list)


# ---------------------------------------------------------------------------
# 4. GET /api/v1/deliveries/courier with courier auth + mocked DB -> 200
# ---------------------------------------------------------------------------

def test_list_courier_deliveries_returns_200(courier_client, mocker):
    mock_conn, mock_cursor = _mock_db_conn_cursor()

    # First query: lookup courier id by user_id/email
    # Second query: fetch deliveries
    call_count = [0]
    original_fetchone = mock_cursor.fetchone

    def side_effect_fetchone():
        call_count[0] += 1
        if call_count[0] == 1:
            # courier lookup: returns (courier_id,)
            return ("courier-1",)
        return None

    mock_cursor.fetchone.side_effect = side_effect_fetchone

    mock_cursor.description = [
        ("delivery_id",), ("delivery_date",), ("shop_name",),
        ("shop_address",), ("client_name",), ("client_address",),
        ("client_postal_code",), ("client_city",), ("time_window",),
        ("bags",), ("status",), ("status_updated_at",),
    ]
    mock_cursor.fetchall.return_value = [
        (
            "d-2", "2026-03-26", "Shop A", "Rue Commerce 5",
            "Bob", "Rue Client 10", "1000", "Lausanne",
            "14:00-16:00", 3, "assigned", None,
        ),
    ]

    mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

    response = courier_client.get("/api/v1/deliveries/courier?date=2026-03-26")
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["delivery_id"] == "d-2"


# ---------------------------------------------------------------------------
# 5. GET /api/v1/deliveries/customer with customer auth + mocked DB -> 200
# ---------------------------------------------------------------------------

def test_list_customer_deliveries_returns_200(customer_client, mocker):
    mock_conn, mock_cursor = _mock_db_conn_cursor()

    mock_cursor.description = [
        ("delivery_id",), ("delivery_date",), ("shop_name",),
        ("time_window",), ("bags",), ("status",),
        ("status_updated_at",),
    ]
    mock_cursor.fetchall.return_value = [
        ("d-3", "2026-03-20", "Boulangerie", "08:00-10:00", 1, "delivered", None),
    ]

    mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

    response = customer_client.get("/api/v1/deliveries/customer")
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["delivery_id"] == "d-3"


# ---------------------------------------------------------------------------
# 6. POST /api/v1/deliveries/shop/preview without shop auth -> 403
# ---------------------------------------------------------------------------

def test_preview_delivery_without_shop_auth_returns_401_or_403(unauthenticated_client):
    response = unauthenticated_client.post(
        "/api/v1/deliveries/shop/preview",
        json={
            "client_id": "00000000-0000-0000-0000-000000000001",
            "delivery_date": "2026-04-01",
            "time_window": "10:00-12:00",
            "bags": 2,
        },
    )
    assert response.status_code in (401, 403)
