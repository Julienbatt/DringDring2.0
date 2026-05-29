"""Integration tests for the deliveries API.

Covers authentication enforcement, input validation, and happy-path
GET/POST with mocked DB results for shop, courier, and customer views.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.guards import (
    require_shop_user,
    require_courier_user,
    require_customer_user,
    require_admin_user,
    require_dispatch_user,
)
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


# ---------------------------------------------------------------------------
# Task 2 (Phase 2 Wave 2 / DISP-03 / DISP-04):
# _apply_delivery_update field-class authorization + audit writes
# ---------------------------------------------------------------------------

def _admin_identity() -> MeResponse:
    return MeResponse(
        user_id="u-admin",
        email="admin@test.com",
        role="admin_region",
        admin_region_id="ar-1",
    )


def _dispatcher_courier_identity() -> MeResponse:
    """A courier with can_dispatch=True — gets the full allowed_classes set."""
    return MeResponse(
        user_id="u-dispatcher",
        email="dispatcher@test.com",
        role="courier",
        courier_id="courier-9",
        can_dispatch=True,
    )


@pytest.fixture
def admin_client():
    admin = _admin_identity()
    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_current_user_claims] = lambda: "{}"
    app.dependency_overrides[require_admin_user] = lambda: admin
    app.dependency_overrides[require_dispatch_user] = lambda: admin
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def shop_outside_region_client():
    """Admin outside the delivery's region — used to verify 403 on GET /corrections."""
    other_admin = MeResponse(
        user_id="u-admin-other",
        email="other@test.com",
        role="admin_region",
        admin_region_id="ar-OTHER",
    )
    app.dependency_overrides[get_current_user] = lambda: other_admin
    app.dependency_overrides[get_current_user_claims] = lambda: "{}"
    app.dependency_overrides[require_admin_user] = lambda: other_admin
    app.dependency_overrides[require_dispatch_user] = lambda: other_admin
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def _stub_tariff_engine(mocker):
    """Stub out the tariff-engine helpers so the test focuses on _apply_delivery_update."""
    mocker.patch(
        "app.routes.deliveries.parse_rule",
        side_effect=lambda v: v if isinstance(v, dict) else {},
    )
    mocker.patch("app.routes.deliveries.validate_tariff_rule", return_value=None)
    mocker.patch(
        "app.routes.deliveries.compute_financials",
        return_value=(
            Decimal("12.00"),  # total_price
            Decimal("0.00"),   # share_client
            Decimal("0.00"),   # share_shop
            Decimal("2.00"),   # share_city
            Decimal("10.00"),  # share_admin_region
        ),
    )
    mocker.patch(
        "app.routes.deliveries.compute_total_price",
        return_value=Decimal("12.00"),
    )


def _build_apply_delivery_update_side_effect(
    *,
    initial_row,
    status_row=("created", None),
    old_frozen=False,
    new_frozen=False,
    tariff_row=("tariff-1", "bags", {"price_per_bag": 5}, {"client": 0, "shop": 0, "city": 20, "admin_region": 80}),
    admin_access_row=None,
    courier_id_row=None,
    courier_assignment_row=None,
    region_row_for_corrections=None,
):
    """Return a side_effect function that simulates the cur.fetchone() sequence for
    one full call to _apply_delivery_update (optionally preceded by _assert_admin_delivery_access
    or the courier identity + assignment lookup or the GET /corrections region query).

    Order (the route reads in this order):
      1. (admin only) _assert_admin_delivery_access SELECT → (shop_id, admin_region_id)
      OR
      1a. (courier PATCH only) SELECT id FROM courier WHERE user_id → (courier_id,)
      1b. (courier PATCH only) SELECT shop_id, courier_id FROM delivery → (shop_id, courier_id)
      OR
      1c. (GET /corrections) SELECT c.admin_region_id FROM delivery + shop + city → (region_id,)

      2. SELECT delivery + delivery_logistics → initial_row (11 cols)
      3. _get_latest_status SELECT → status_row
      4. _is_period_frozen old → (1,) or None
      5. _is_period_frozen new → (1,) or None
      6. SELECT shop.tariff_version_id → ("tariff-1",)
      7. SELECT tariff_version → (id, rule_type, rule, share)
    """
    responses = []
    if admin_access_row is not None:
        responses.append(admin_access_row)
    if courier_id_row is not None:
        responses.append(courier_id_row)
    if courier_assignment_row is not None:
        responses.append(courier_assignment_row)
    if region_row_for_corrections is not None:
        responses.append(region_row_for_corrections)

    responses.extend([
        initial_row,
        status_row,
        (1,) if old_frozen else None,
        (1,) if new_frozen else None,
        ("tariff-1",),  # shop.tariff_version_id
        tariff_row,
    ])
    return responses


def _count_audit_inserts(mock_cursor) -> int:
    return sum(
        1
        for call in mock_cursor.execute.call_args_list
        if "delivery_correction_audit" in (call.args[0] if call.args else "")
    )


def _audit_fields(mock_cursor) -> list[str]:
    """Return the list of `field` values passed into INSERT delivery_correction_audit."""
    fields = []
    for call in mock_cursor.execute.call_args_list:
        sql = call.args[0] if call.args else ""
        if "delivery_correction_audit" in sql and "INSERT" in sql:
            # The audit INSERT uses positional params: (delivery_id, actor_user_id,
            # actor_role, field, old_value, new_value, reason)
            params = call.args[1] if len(call.args) > 1 else ()
            if len(params) >= 4:
                fields.append(params[3])
    return fields


class TestDeliveryCorrectionAudit:
    """Tests behaviors 2-10 in PLAN Task 2 <behavior> for _apply_delivery_update."""

    # The base 11-column tuple matching the SELECT in _apply_delivery_update:
    # (delivery_shop_id, delivery_date, client_id, time_window, bags,
    #  order_amount, basket_value, notes, floor, door_code, is_cms)
    @staticmethod
    def _base_row(**overrides):
        base = {
            "delivery_shop_id": "shop-1",
            "delivery_date": "2026-04-01",  # FastAPI/psycopg accepts strings; route converts
            "client_id": "client-1",
            "time_window": "10:00-12:00",
            "bags": 4,
            "order_amount": Decimal("50.00"),
            "basket_value": Decimal("60.00"),
            "notes": "ring twice",
            "floor": "2",
            "door_code": "1234",
            "is_cms": False,
        }
        base.update(overrides)
        # Convert string dates to date objects (the route compares .replace(day=1))
        from datetime import date
        if isinstance(base["delivery_date"], str):
            base["delivery_date"] = date.fromisoformat(base["delivery_date"])
        return (
            base["delivery_shop_id"],
            base["delivery_date"],
            base["client_id"],
            base["time_window"],
            base["bags"],
            base["order_amount"],
            base["basket_value"],
            base["notes"],
            base["floor"],
            base["door_code"],
            base["is_cms"],
        )

    # ---- Behavior 2/6/8: successful PATCH writes audit row per changed field ----

    def test_shop_patch_with_floor_change_writes_one_audit_row(
        self, shop_client, mocker
    ):
        """Shop PATCH changing only `floor` writes exactly one audit row for field='floor'."""
        mock_conn, mock_cursor = _mock_db_conn_cursor()
        mock_cursor.rowcount = 1
        responses = _build_apply_delivery_update_side_effect(
            initial_row=self._base_row(floor="2"),
        )
        mock_cursor.fetchone.side_effect = responses
        _stub_tariff_engine(mocker)
        mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

        response = shop_client.patch(
            "/api/v1/deliveries/shop/d-1",
            json={"floor": "3A"},
        )
        assert response.status_code == 200, response.text
        assert _count_audit_inserts(mock_cursor) == 1
        assert _audit_fields(mock_cursor) == ["floor"]

    def test_shop_patch_with_floor_and_bags_writes_two_audit_rows(
        self, shop_client, mocker
    ):
        """A payload changing floor + bags writes two audit rows, one per field."""
        mock_conn, mock_cursor = _mock_db_conn_cursor()
        mock_cursor.rowcount = 1
        responses = _build_apply_delivery_update_side_effect(
            initial_row=self._base_row(floor="2", bags=4),
        )
        mock_cursor.fetchone.side_effect = responses
        _stub_tariff_engine(mocker)
        mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

        response = shop_client.patch(
            "/api/v1/deliveries/shop/d-1",
            json={"floor": "3A", "bags": 5},
        )
        assert response.status_code == 200, response.text
        fields = _audit_fields(mock_cursor)
        assert sorted(fields) == ["bags", "floor"]

    # ---- Behavior 7: no audit row when old == new ----

    def test_shop_patch_noop_floor_writes_zero_audit_rows(
        self, shop_client, mocker
    ):
        """Sending {"floor": "2"} when the existing floor is already "2" → zero audit rows."""
        mock_conn, mock_cursor = _mock_db_conn_cursor()
        mock_cursor.rowcount = 1
        responses = _build_apply_delivery_update_side_effect(
            initial_row=self._base_row(floor="2"),
        )
        mock_cursor.fetchone.side_effect = responses
        _stub_tariff_engine(mocker)
        mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

        response = shop_client.patch(
            "/api/v1/deliveries/shop/d-1",
            json={"floor": "2"},
        )
        assert response.status_code == 200, response.text
        assert _count_audit_inserts(mock_cursor) == 0

    # ---- Behavior 3: frozen period rejection — 409 + no audit ----

    def test_shop_patch_on_frozen_period_returns_409_and_no_audit(
        self, shop_client, mocker
    ):
        """Frozen old period → 409 + 0 audit rows + 0 UPDATEs after the rejection."""
        mock_conn, mock_cursor = _mock_db_conn_cursor()
        mock_cursor.rowcount = 1
        responses = _build_apply_delivery_update_side_effect(
            initial_row=self._base_row(),
            old_frozen=True,
        )
        mock_cursor.fetchone.side_effect = responses
        _stub_tariff_engine(mocker)
        mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

        response = shop_client.patch(
            "/api/v1/deliveries/shop/d-1",
            json={"floor": "3A"},
        )
        assert response.status_code == 409
        assert response.json()["detail"] == "Billing period is frozen"
        assert _count_audit_inserts(mock_cursor) == 0
        # Verify no UPDATE statements ran
        update_calls = [
            c for c in mock_cursor.execute.call_args_list
            if "UPDATE delivery" in (c.args[0] if c.args else "")
        ]
        assert update_calls == []

    # ---- Behavior 4: delivery locked rejection — 409 + no audit ----

    def test_shop_patch_on_locked_delivery_returns_409_and_no_audit(
        self, shop_client, mocker
    ):
        """Status=picked_up → not in EDITABLE_STATUSES → 409 'Delivery is locked'."""
        mock_conn, mock_cursor = _mock_db_conn_cursor()
        mock_cursor.rowcount = 1
        responses = _build_apply_delivery_update_side_effect(
            initial_row=self._base_row(),
            status_row=("picked_up", datetime(2026, 3, 1, tzinfo=timezone.utc)),
        )
        mock_cursor.fetchone.side_effect = responses
        _stub_tariff_engine(mocker)
        mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

        response = shop_client.patch(
            "/api/v1/deliveries/shop/d-1",
            json={"floor": "3A"},
        )
        assert response.status_code == 409
        assert response.json()["detail"] == "Delivery is locked"
        assert _count_audit_inserts(mock_cursor) == 0

    # ---- Behavior 5: is_cms is read but never written ----

    def test_shop_patch_does_not_write_is_cms(self, shop_client, mocker):
        """No execute call should contain 'is_cms = ' in an UPDATE block."""
        mock_conn, mock_cursor = _mock_db_conn_cursor()
        mock_cursor.rowcount = 1
        responses = _build_apply_delivery_update_side_effect(
            initial_row=self._base_row(is_cms=True),
        )
        mock_cursor.fetchone.side_effect = responses
        _stub_tariff_engine(mocker)
        mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

        response = shop_client.patch(
            "/api/v1/deliveries/shop/d-1",
            json={"floor": "3A"},
        )
        assert response.status_code == 200, response.text
        # No UPDATE statement may contain "is_cms ="
        for call in mock_cursor.execute.call_args_list:
            sql = call.args[0] if call.args else ""
            if "UPDATE" in sql:
                assert "is_cms" not in sql, f"is_cms appears in an UPDATE: {sql}"

    # ---- Behavior 2: audit captures actor_user_id + actor_role from JWT ----

    def test_audit_row_uses_actor_from_jwt(self, shop_client, mocker):
        """The audit INSERT params for actor_user_id / actor_role match the JWT identity, not the body."""
        mock_conn, mock_cursor = _mock_db_conn_cursor()
        mock_cursor.rowcount = 1
        responses = _build_apply_delivery_update_side_effect(
            initial_row=self._base_row(floor="2"),
        )
        mock_cursor.fetchone.side_effect = responses
        _stub_tariff_engine(mocker)
        mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

        response = shop_client.patch(
            "/api/v1/deliveries/shop/d-1",
            json={"floor": "3A"},
        )
        assert response.status_code == 200
        audit_calls = [
            c for c in mock_cursor.execute.call_args_list
            if "delivery_correction_audit" in (c.args[0] if c.args else "")
        ]
        assert len(audit_calls) == 1
        # params: (delivery_id, actor_user_id, actor_role, field, old, new, reason)
        params = audit_calls[0].args[1]
        assert params[0] == "d-1"
        assert params[1] == "u-shop"      # from _shop_identity()
        assert params[2] == "shop"        # from _shop_identity()
        assert params[3] == "floor"

    # ---- Behavior 1: signature change keeps shop path byte-identical ----

    def test_shop_patch_with_full_payload_still_works(self, shop_client, mocker):
        """The existing shop path (logistics+financial+scheduling) still returns 200."""
        mock_conn, mock_cursor = _mock_db_conn_cursor()
        mock_cursor.rowcount = 1
        responses = _build_apply_delivery_update_side_effect(
            initial_row=self._base_row(),
        )
        mock_cursor.fetchone.side_effect = responses
        _stub_tariff_engine(mocker)
        mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

        response = shop_client.patch(
            "/api/v1/deliveries/shop/d-1",
            json={
                "floor": "3A",
                "door_code": "9999",
                "notes": "new note",
                "bags": 5,
                "order_amount": 75.0,
                "basket_value": 80.0,
                "delivery_date": "2026-04-15",
                "time_window": "14:00-16:00",
            },
        )
        assert response.status_code == 200, response.text

    # ---- Behavior 9 / 10: covered indirectly through Task 3 (courier endpoint).
    # We only verify here that the unit-level assert_payload_within_classes runs
    # BEFORE the freeze check via the helper module, which Task 1 already covered.

    # ---- Behavior: admin path still wires actor + allowed_classes ----

    def test_admin_patch_works_and_writes_audit(self, admin_client, mocker):
        """Admin can change client_id (identity), and that produces no audit row
        because the helper currently does not include client_id in candidate_changes.
        But changing bags produces one audit row.
        """
        mock_conn, mock_cursor = _mock_db_conn_cursor()
        mock_cursor.rowcount = 1
        responses = _build_apply_delivery_update_side_effect(
            initial_row=self._base_row(bags=4),
            admin_access_row=("shop-1", "ar-1"),
        )
        mock_cursor.fetchone.side_effect = responses
        _stub_tariff_engine(mocker)
        mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

        response = admin_client.patch(
            "/api/v1/deliveries/admin/d-1",
            json={"bags": 6},
        )
        assert response.status_code == 200, response.text
        assert "bags" in _audit_fields(mock_cursor)


# ---------------------------------------------------------------------------
# Task 3 (Phase 2 Wave 2 / DISP-03 read side / DISP-04):
# PATCH /deliveries/courier/{id} + GET /deliveries/{id}/corrections
# ---------------------------------------------------------------------------

class TestCourierPatchAndCorrections:
    """Eight tests covering the new routes from Task 3."""

    @staticmethod
    def _base_row(**overrides):
        return TestDeliveryCorrectionAudit._base_row(**overrides)

    # ---- PATCH /courier/{id} happy + auth + 404 ----

    def test_courier_patch_logistics_succeeds_when_assigned(
        self, courier_client, mocker
    ):
        """A courier sending {floor:..} on their own assigned delivery → 200."""
        mock_conn, mock_cursor = _mock_db_conn_cursor()
        mock_cursor.rowcount = 1
        responses = _build_apply_delivery_update_side_effect(
            initial_row=self._base_row(floor="2"),
            courier_id_row=("courier-1",),
            courier_assignment_row=("shop-1", "courier-1"),
        )
        mock_cursor.fetchone.side_effect = responses
        _stub_tariff_engine(mocker)
        mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

        response = courier_client.patch(
            "/api/v1/deliveries/courier/d-1",
            json={"floor": "5"},
        )
        assert response.status_code == 200, response.text
        assert "floor" in _audit_fields(mock_cursor)

    def test_courier_patch_returns_403_when_not_assigned(
        self, courier_client, mocker
    ):
        """delivery.courier_id != my_courier_id → 403 'Not assigned to this delivery'."""
        mock_conn, mock_cursor = _mock_db_conn_cursor()
        mock_cursor.fetchone.side_effect = [
            ("courier-1",),                   # courier identity
            ("shop-1", "courier-OTHER"),      # assignment lookup — different courier
        ]
        mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

        response = courier_client.patch(
            "/api/v1/deliveries/courier/d-1",
            json={"floor": "5"},
        )
        assert response.status_code == 403
        assert response.json()["detail"] == "Not assigned to this delivery"

    def test_courier_patch_returns_404_when_delivery_missing(
        self, courier_client, mocker
    ):
        """SELECT shop_id, courier_id FROM delivery → None → 404 'Delivery not found'."""
        mock_conn, mock_cursor = _mock_db_conn_cursor()
        mock_cursor.fetchone.side_effect = [
            ("courier-1",),  # courier identity
            None,            # assignment lookup — no row
        ]
        mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

        response = courier_client.patch(
            "/api/v1/deliveries/courier/d-1",
            json={"floor": "5"},
        )
        assert response.status_code == 404
        assert response.json()["detail"] == "Delivery not found"

    def test_courier_patch_with_bags_returns_422_from_pydantic(
        self, courier_client
    ):
        """CourierDeliveryUpdate forbids unknown fields → 422 from FastAPI."""
        response = courier_client.patch(
            "/api/v1/deliveries/courier/d-1",
            json={"bags": 5},
        )
        assert response.status_code == 422

    def test_courier_patch_succeeds_post_delivered_within_grace(
        self, courier_client, mocker
    ):
        """A delivery marked 'delivered' 1 hour ago is still editable for logistics."""
        mock_conn, mock_cursor = _mock_db_conn_cursor()
        mock_cursor.rowcount = 1
        recent = datetime.now(timezone.utc) - timedelta(hours=1)
        responses = _build_apply_delivery_update_side_effect(
            initial_row=self._base_row(floor="2"),
            status_row=("delivered", recent),
            courier_id_row=("courier-1",),
            courier_assignment_row=("shop-1", "courier-1"),
        )
        mock_cursor.fetchone.side_effect = responses
        _stub_tariff_engine(mocker)
        mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

        response = courier_client.patch(
            "/api/v1/deliveries/courier/d-1",
            json={"floor": "5"},
        )
        assert response.status_code == 200, response.text

    # ---- GET /{id}/corrections ----

    def test_get_corrections_returns_rows_for_admin_in_region(
        self, admin_client, mocker
    ):
        """Admin in matching region gets the audit rows."""
        mock_conn, mock_cursor = _mock_db_conn_cursor()
        mock_cursor.fetchone.side_effect = [
            ("ar-1",),  # region lookup row matching admin's admin_region_id
        ]
        mock_cursor.description = [
            ("id",), ("delivery_id",), ("actor_user_id",), ("actor_role",),
            ("field",), ("old_value",), ("new_value",), ("reason",),
            ("created_at",),
        ]
        mock_cursor.fetchall.return_value = [
            (
                "audit-1", "d-1", "u-shop", "shop", "floor",
                '"2"', '"3A"', None, datetime(2026, 5, 1, 10, 0, tzinfo=timezone.utc),
            ),
        ]
        mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

        response = admin_client.get("/api/v1/deliveries/d-1/corrections")
        assert response.status_code == 200, response.text
        rows = response.json()
        assert isinstance(rows, list)
        assert len(rows) == 1
        assert rows[0]["field"] == "floor"

    def test_get_corrections_returns_403_for_admin_outside_region(
        self, shop_outside_region_client, mocker
    ):
        """Admin whose admin_region_id ≠ delivery's region → 403 'Not in your region'."""
        mock_conn, mock_cursor = _mock_db_conn_cursor()
        mock_cursor.fetchone.side_effect = [
            ("ar-1",),  # delivery's region, NOT this admin's "ar-OTHER"
        ]
        mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

        response = shop_outside_region_client.get(
            "/api/v1/deliveries/d-1/corrections"
        )
        assert response.status_code == 403
        assert response.json()["detail"] == "Not in your region"

    def test_get_corrections_returns_403_for_shop_user(self, shop_client):
        """Shop role is not in require_dispatch_user → 403."""
        response = shop_client.get("/api/v1/deliveries/d-1/corrections")
        # Either 401/403 depending on which guard fires; we accept both.
        assert response.status_code in (401, 403)

    def test_get_corrections_returns_404_for_unknown_delivery(
        self, admin_client, mocker
    ):
        """GET on a delivery that doesn't exist → 404 'Delivery not found'."""
        mock_conn, mock_cursor = _mock_db_conn_cursor()
        mock_cursor.fetchone.side_effect = [None]
        mocker.patch("app.routes.deliveries.get_db_connection", return_value=mock_conn)

        response = admin_client.get("/api/v1/deliveries/d-NOPE/corrections")
        assert response.status_code == 404
        assert response.json()["detail"] == "Delivery not found"
