"""Unit tests for app.core.delivery_fields (DISP-04 / Wave 2 / Task 1).

Tests:
- FIELD_CLASS taxonomy (every column the existing _apply_delivery_update touches).
- ALLOWED_CLASSES_FOR_ACTOR for every role + can_dispatch flag combination.
- assert_payload_within_classes raises 403 with the expected detail strings.
- CourierDeliveryUpdate rejects unknown fields (extra="forbid").
"""

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.delivery_fields import (
    FIELD_CLASS,
    ALLOWED_CLASSES_FOR_ACTOR,
    assert_payload_within_classes,
)
from app.schemas.delivery import CourierDeliveryUpdate
from app.schemas.me import MeResponse


# ---------------------------------------------------------------------------
# FIELD_CLASS taxonomy
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "field_name,expected_class",
    [
        ("floor", "logistics"),
        ("door_code", "logistics"),
        ("notes", "logistics"),
        ("bags", "financial"),
        ("order_amount", "financial"),
        ("basket_value", "financial"),
        ("client_id", "identity"),
        ("delivery_date", "scheduling"),
        ("time_window", "scheduling"),
    ],
)
def test_field_class_taxonomy(field_name, expected_class):
    assert FIELD_CLASS[field_name] == expected_class


def test_field_class_is_complete():
    """Sanity: the taxonomy contains exactly the nine columns the plan enumerates."""
    assert set(FIELD_CLASS.keys()) == {
        "floor", "door_code", "notes",
        "bags", "order_amount", "basket_value",
        "client_id",
        "delivery_date", "time_window",
    }


# ---------------------------------------------------------------------------
# ALLOWED_CLASSES_FOR_ACTOR
# ---------------------------------------------------------------------------

def _actor(role: str, can_dispatch: bool = False) -> MeResponse:
    return MeResponse(
        user_id="u-test",
        email=f"{role}@test.com",
        role=role,
        can_dispatch=can_dispatch,
    )


def test_allowed_classes_super_admin_all():
    actor = _actor("super_admin")
    assert ALLOWED_CLASSES_FOR_ACTOR(actor) == {
        "logistics", "financial", "identity", "scheduling",
    }


def test_allowed_classes_admin_region_all():
    actor = _actor("admin_region")
    assert ALLOWED_CLASSES_FOR_ACTOR(actor) == {
        "logistics", "financial", "identity", "scheduling",
    }


def test_allowed_classes_courier_can_dispatch_all():
    actor = _actor("courier", can_dispatch=True)
    assert ALLOWED_CLASSES_FOR_ACTOR(actor) == {
        "logistics", "financial", "identity", "scheduling",
    }


def test_allowed_classes_courier_default_logistics_only():
    actor = _actor("courier", can_dispatch=False)
    assert ALLOWED_CLASSES_FOR_ACTOR(actor) == {"logistics"}


def test_allowed_classes_shop_logistics_financial_scheduling():
    """Matches today's ShopDeliveryUpdate surface (shops never change client_id)."""
    actor = _actor("shop")
    assert ALLOWED_CLASSES_FOR_ACTOR(actor) == {
        "logistics", "financial", "scheduling",
    }


def test_allowed_classes_customer_empty():
    """Defensive default: unhandled roles get an empty set."""
    actor = _actor("customer")
    assert ALLOWED_CLASSES_FOR_ACTOR(actor) == set()


# ---------------------------------------------------------------------------
# assert_payload_within_classes
# ---------------------------------------------------------------------------

def test_assert_payload_courier_logistics_only_raises_on_bags():
    """DISP-04: a courier sending bags MUST get 403 with the courier detail."""
    with pytest.raises(HTTPException) as exc:
        assert_payload_within_classes({"bags": 5}, {"logistics"})
    assert exc.value.status_code == 403
    assert exc.value.detail == "Field not editable by courier"


def test_assert_payload_courier_logistics_only_accepts_floor():
    """A courier sending logistics fields is allowed."""
    assert_payload_within_classes({"floor": "3A"}, {"logistics"})


def test_assert_payload_courier_logistics_only_accepts_multiple_logistics():
    assert_payload_within_classes(
        {"floor": "3A", "door_code": "1234", "notes": "ring twice"},
        {"logistics"},
    )


def test_assert_payload_ignores_none_values():
    """Pydantic exclude_unset hands us a dict without None — but defensively, None must be ignored."""
    assert_payload_within_classes({"notes": None, "bags": None}, {"logistics"})


def test_assert_payload_admin_full_accepts_all():
    """Dispatcher / admin can touch every class."""
    assert_payload_within_classes(
        {
            "floor": "3A", "bags": 5, "delivery_date": "2026-06-01",
            "time_window": "10:00-12:00", "client_id": "abc",
        },
        {"logistics", "financial", "identity", "scheduling"},
    )


def test_assert_payload_non_courier_uses_generic_detail():
    """When the actor has more than just logistics (e.g. partial set), the detail string is the generic one."""
    with pytest.raises(HTTPException) as exc:
        assert_payload_within_classes(
            {"client_id": "abc"}, {"logistics", "financial", "scheduling"}
        )
    assert exc.value.status_code == 403
    assert exc.value.detail == "Field not editable"


def test_assert_payload_unknown_field_raises():
    """A field NOT in FIELD_CLASS must raise — we never silently allow unknown keys."""
    with pytest.raises((HTTPException, KeyError)):
        assert_payload_within_classes({"random_unknown_field": "x"}, {"logistics"})


# ---------------------------------------------------------------------------
# CourierDeliveryUpdate schema (Pydantic extra=forbid)
# ---------------------------------------------------------------------------

def test_courier_delivery_update_accepts_logistics_fields():
    p = CourierDeliveryUpdate(floor="3", door_code="1234", notes="ring")
    assert p.floor == "3"
    assert p.door_code == "1234"
    assert p.notes == "ring"


def test_courier_delivery_update_rejects_bags():
    """DISP-04 defense-in-depth: a courier sending bags gets a Pydantic ValidationError."""
    with pytest.raises(ValidationError):
        CourierDeliveryUpdate(bags=5)


def test_courier_delivery_update_rejects_delivery_date():
    with pytest.raises(ValidationError):
        CourierDeliveryUpdate(delivery_date="2026-06-01")


def test_courier_delivery_update_rejects_order_amount():
    with pytest.raises(ValidationError):
        CourierDeliveryUpdate(order_amount=99.0)


def test_courier_delivery_update_allows_empty_payload():
    """An empty payload is structurally valid (semantically a noop but the schema accepts it)."""
    p = CourierDeliveryUpdate()
    assert p.floor is None
    assert p.door_code is None
    assert p.notes is None
