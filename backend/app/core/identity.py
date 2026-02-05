import json

from fastapi import HTTPException

from app.db.session import get_db_connection
from app.schemas.me import MeResponse


def resolve_identity(user_id: str, email: str, jwt_claims: str) -> MeResponse:
    """
    Central identity source of truth for DringDring.
    """
    try:
        with get_db_connection(jwt_claims) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT role, city_id, hq_id, shop_id, admin_region_id, client_id
                    FROM public.profiles
                    WHERE id = %s
                    """,
                    (user_id,),
                )
                row = cur.fetchone()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    claims = {}
    try:
        claims = json.loads(jwt_claims) if jwt_claims else {}
    except Exception:
        claims = {}
    app_metadata = claims.get("app_metadata") or {}

    if row:
        role, city_id, hq_id, shop_id, admin_region_id, client_id = row
    else:
        role = city_id = hq_id = shop_id = admin_region_id = client_id = None

    def _normalized(value):
        if value in ("", None):
            return None
        return value

    def _fallback(value, key):
        value = _normalized(value)
        return value if value is not None else app_metadata.get(key)

    role = _normalized(role) or app_metadata.get("role") or "guest"
    city_id = _fallback(city_id, "city_id")
    hq_id = _fallback(hq_id, "hq_id")
    shop_id = _fallback(shop_id, "shop_id")
    admin_region_id = _fallback(admin_region_id, "admin_region_id")
    client_id = _fallback(client_id, "client_id")

    def _to_str(value):
        return str(value) if value is not None else None

    courier_id = None
    can_dispatch = False
    if role == "courier":
        try:
            with get_db_connection(jwt_claims) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT id, admin_region_id, can_dispatch
                        FROM public.courier
                        WHERE user_id = %s
                        LIMIT 1
                        """,
                        (user_id,),
                    )
                    courier_row = cur.fetchone()
                    if courier_row:
                        courier_id, courier_admin_region_id, courier_can_dispatch = courier_row
                        if not admin_region_id and courier_admin_region_id:
                            admin_region_id = courier_admin_region_id
                        can_dispatch = bool(courier_can_dispatch)
        except Exception:
            courier_id = None
            can_dispatch = False

    return MeResponse(
        user_id=user_id,
        email=email,
        role=role,
        city_id=_to_str(city_id),
        hq_id=_to_str(hq_id),
        shop_id=_to_str(shop_id),
        admin_region_id=_to_str(admin_region_id),
        client_id=_to_str(client_id),
        courier_id=_to_str(courier_id),
        can_dispatch=can_dispatch,
    )
