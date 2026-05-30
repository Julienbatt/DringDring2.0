"""Field-class taxonomy + actor-class authorization for delivery corrections.

Phase 2 / Wave 2 / DISP-04.

This module codifies WHO can edit WHICH fields on a delivery:

  - logistics  → floor, door_code, notes              (the courier-doorman fix-up)
  - financial  → bags, order_amount, basket_value     (recomputed by compute_financials)
  - identity   → client_id                            (rare; dispatcher/admin only)
  - scheduling → delivery_date, time_window           (dispatcher/admin/shop)

`ALLOWED_CLASSES_FOR_ACTOR` returns the set of field classes a given actor
(MeResponse from the verified JWT) may mutate. `assert_payload_within_classes`
is the runtime gate raised by `_apply_delivery_update` BEFORE any UPDATE runs.

The two gates work together:
  1. Pydantic `extra="forbid"` on CourierDeliveryUpdate rejects unknown keys
     at HTTP 422 — first line of defense against a courier sneaking bags in.
  2. `assert_payload_within_classes` runs server-side and returns HTTP 403 even
     when the schema would have allowed the key — second line of defense for
     callers that use a more permissive schema (e.g. shop/admin reusing
     ShopDeliveryUpdate).
"""

from typing import Literal

from fastapi import HTTPException

from app.schemas.me import MeResponse


FieldClass = Literal["logistics", "financial", "identity", "scheduling"]


# Every column that participates in an _apply_delivery_update mutation,
# mapped to its field class. The keys MUST match the actual column names
# in `delivery` / `delivery_logistics` so we can use them both to look up
# authorization AND to write audit rows.
FIELD_CLASS: dict[str, FieldClass] = {
    # logistics — the courier-on-the-ground fix-up surface
    "floor": "logistics",
    "door_code": "logistics",
    "notes": "logistics",
    # financial — feeds compute_financials
    "bags": "financial",
    "order_amount": "financial",
    "basket_value": "financial",
    # identity — who the delivery is for
    "client_id": "identity",
    # scheduling — when the delivery is for
    "delivery_date": "scheduling",
    "time_window": "scheduling",
}


def ALLOWED_CLASSES_FOR_ACTOR(actor: MeResponse) -> set[FieldClass]:
    """Return the field classes the given actor may mutate.

    Branches:
      - super_admin / admin_region            → every class
      - courier with can_dispatch=True        → every class (dispatcher path)
      - courier with can_dispatch=False       → logistics only (DISP-04)
      - shop                                  → logistics + financial + scheduling
                                                (matches today's ShopDeliveryUpdate)
      - any other role                        → empty set (defensive)
    """
    role = actor.role
    if role in {"super_admin", "admin_region"}:
        return {"logistics", "financial", "identity", "scheduling"}
    if role == "courier":
        if actor.can_dispatch:
            return {"logistics", "financial", "identity", "scheduling"}
        return {"logistics"}
    if role == "shop":
        return {"logistics", "financial", "scheduling"}
    return set()


def assert_payload_within_classes(
    payload_dict: dict,
    allowed: set,
) -> None:
    """Raise HTTPException(403) if any field in `payload_dict` is outside `allowed`.

    Inputs:
      - `payload_dict`: typically `payload.dict(exclude_unset=True)`. None values
        are skipped so legacy callers that send `None` to mean "do not change"
        don't trigger a false positive.
      - `allowed`: result of `ALLOWED_CLASSES_FOR_ACTOR(actor)`.

    Detail strings:
      - "Field not editable by courier" when `allowed == {"logistics"}` —
        this is the courier-specific message DISP-04 tests assert on.
      - "Field not editable" for any other denied case (defensive).

    A key NOT in FIELD_CLASS is also rejected with 403 — we never silently allow
    unknown keys, even if the upstream schema let one through.
    """
    courier_only = allowed == {"logistics"}
    for field_name, value in payload_dict.items():
        if value is None:
            continue
        field_class = FIELD_CLASS.get(field_name)
        if field_class is None:
            raise HTTPException(
                status_code=403,
                detail="Field not editable",
            )
        if field_class not in allowed:
            raise HTTPException(
                status_code=403,
                detail="Field not editable by courier" if courier_only else "Field not editable",
            )
