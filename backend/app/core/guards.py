from fastapi import Depends, HTTPException, status

from app.core.identity import resolve_identity
from app.core.security import get_current_user, get_current_user_claims
from app.db.session import get_db_connection
from app.schemas.me import MeResponse


def _require_identity(
    expected_role: str,
    user=Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
) -> MeResponse:
    identity = resolve_identity(
        user_id=user.user_id,
        email=user.email,
        jwt_claims=jwt_claims,
    )

    if identity.role != expected_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{expected_role.capitalize()} access required",
        )

    return identity


def require_city_user(
    user=Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
) -> MeResponse:
    identity = _require_identity("city", user, jwt_claims)
    if not identity.city_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="City access required",
        )
    return identity


def require_hq_user(
    user=Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
) -> MeResponse:
    identity = _require_identity("hq", user, jwt_claims)
    if not identity.hq_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HQ access required",
        )
    return identity


def require_hq_or_admin_user(
    user=Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
) -> MeResponse:
    identity = resolve_identity(
        user_id=user.user_id,
        email=user.email,
        jwt_claims=jwt_claims,
    )
    if identity.role not in {"hq", "admin_region", "super_admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HQ or admin access required",
        )
    return identity


def require_hq_or_admin_user_for_shop(
    shop_id: str,
    user=Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
) -> MeResponse:
    identity = resolve_identity(
        user_id=user.user_id,
        email=user.email,
        jwt_claims=jwt_claims,
    )

    if identity.role == "super_admin":
        return identity

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.hq_id, c.canton_id
                FROM shop s
                JOIN city c ON c.id = s.city_id
                WHERE s.id = %s
                """,
                (shop_id,),
            )
            row = cur.fetchone()

            if not row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Shop not found",
                )

            shop_hq_id, canton_id = row

            cur.execute(
                """
                SELECT id
                FROM admin_region
                WHERE canton_id = %s AND active = true
                ORDER BY name
                LIMIT 1
                """,
                (canton_id,),
            )
            admin_region_row = cur.fetchone()
            admin_region_id = admin_region_row[0] if admin_region_row else None

    if identity.role == "admin_region":
        if not identity.admin_region_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin region access required",
            )
        if str(identity.admin_region_id) != str(admin_region_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin region access required",
            )
        return identity

    if identity.role == "hq":
        if not identity.hq_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="HQ access required",
            )
        if str(identity.hq_id) != str(shop_hq_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="HQ access required",
            )
        return identity

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Admin region access required",
    )


def require_admin_user(
    user=Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
) -> MeResponse:
    identity = resolve_identity(
        user_id=user.user_id,
        email=user.email,
        jwt_claims=jwt_claims,
    )
    if identity.role not in ("admin_region", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return identity


def require_dispatch_user(
    user=Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
) -> MeResponse:
    identity = resolve_identity(
        user_id=user.user_id,
        email=user.email,
        jwt_claims=jwt_claims,
    )
    if identity.role in ("admin_region", "super_admin"):
        return identity
    if identity.role == "courier" and identity.can_dispatch:
        return identity
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Dispatch access required",
    )


def require_admin_or_city_user(
    user=Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
) -> MeResponse:
    identity = resolve_identity(
        user_id=user.user_id,
        email=user.email,
        jwt_claims=jwt_claims,
    )
    if identity.role not in ("admin_region", "super_admin", "city"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or city access required",
        )
    if identity.role == "city" and not identity.city_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="City access required",
        )
    return identity


def require_tariff_reader(
    user=Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
) -> MeResponse:
    identity = resolve_identity(
        user_id=user.user_id,
        email=user.email,
        jwt_claims=jwt_claims,
    )
    if identity.role not in {"admin_region", "super_admin", "hq", "city", "shop"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tariff read access required",
        )
    if identity.role == "admin_region" and not identity.admin_region_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin region access required",
        )
    if identity.role == "hq" and not identity.hq_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HQ access required",
        )
    if identity.role == "city" and not identity.city_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="City access required",
        )
    if identity.role == "shop" and not identity.shop_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Shop access required",
        )
    return identity



def require_super_admin_user(
    user=Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
) -> MeResponse:
    return _require_identity("super_admin", user, jwt_claims)

# Alias for compatibility with some routes
require_super_admin = require_super_admin_user


def require_shop_user(
    user=Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
) -> MeResponse:
    identity = _require_identity("shop", user, jwt_claims)
    if not identity.shop_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Shop access required",
        )
    return identity


def require_courier_user(
    user=Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
) -> MeResponse:
    return _require_identity("courier", user, jwt_claims)


def require_customer_user(
    user=Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
) -> MeResponse:
    identity = _require_identity("customer", user, jwt_claims)
    if not identity.client_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Client access required",
        )
    return identity
