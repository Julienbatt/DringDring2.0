import base64
import json
import time
import urllib.request
import logging
from typing import Any, Dict, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import settings
from app.schemas.me import MeResponse

security = HTTPBearer()
logger = logging.getLogger(__name__)
_JWKS_CACHE: dict[str, Any] = {"expires_at": 0, "keys": []}
_JWKS_TTL_SECONDS = 300


def _decode_jwt(token: str) -> Dict[str, Any]:
    secret = settings.SUPABASE_JWT_SECRET
    header = {}
    try:
        header = jwt.get_unverified_header(token)
    except Exception:
        header = {}

    alg = header.get("alg")
    kid = header.get("kid")
    try:
        if alg in (None, "HS256"):
            return jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience="authenticated",
                options={"verify_aud": True},
            )
    except JWTError:
        pass

    try:
        if alg in (None, "HS256"):
            decoded_secret = base64.b64decode(secret)
            return jwt.decode(
                token,
                decoded_secret,
                algorithms=["HS256"],
                audience="authenticated",
                options={"verify_aud": True},
            )
    except Exception:
        pass

    if alg and alg.startswith("ES"):
        key = _get_jwks_key(kid)
        if key:
            try:
                return jwt.decode(
                    token,
                    key,
                    algorithms=[alg],
                    audience="authenticated",
                    options={"verify_aud": True},
                )
            except Exception:
                pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _get_jwks() -> dict[str, Any]:
    now = time.time()
    if _JWKS_CACHE["expires_at"] > now and _JWKS_CACHE["keys"]:
        return _JWKS_CACHE

    jwks_url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    headers = {}
    if settings.SUPABASE_SERVICE_KEY:
        headers = {
            "apikey": settings.SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
        }
    req = urllib.request.Request(jwks_url, headers=headers)
    with urllib.request.urlopen(req, timeout=5) as response:
        data = json.loads(response.read().decode("utf-8"))

    keys = data.get("keys", [])
    _JWKS_CACHE["keys"] = keys
    _JWKS_CACHE["expires_at"] = now + _JWKS_TTL_SECONDS
    return _JWKS_CACHE


def _get_jwks_key(kid: Optional[str]) -> Optional[dict[str, Any]]:
    if not kid:
        return None
    try:
        keys = _get_jwks().get("keys", [])
    except Exception:
        return None
    for key in keys:
        if key.get("kid") == kid:
            return key
    return None


def _first_value(data: Dict[str, Any], keys: list[str]) -> Any:
    for key in keys:
        value = data.get(key)
        if value is not None:
            return value
    return None


def get_current_user_claims(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    token = credentials.credentials
    try:
        payload = _decode_jwt(token)
        return json.dumps(payload)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("get_current_user_claims failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service unavailable",
        ) from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> MeResponse:
    token = credentials.credentials
    try:
        payload = _decode_jwt(token)
        app_metadata = payload.get("app_metadata") or {}
        return MeResponse(
            user_id=str(payload.get("sub")),
            email=_first_value(payload, ["email"]),
            role=_first_value(app_metadata, ["role"]) or _first_value(payload, ["role"]),
            city_id=_first_value(app_metadata, ["city_id", "cityId"]),
            hq_id=_first_value(app_metadata, ["hq_id", "hqId"]),
            shop_id=_first_value(app_metadata, ["shop_id", "shopId"]),
            admin_region_id=_first_value(app_metadata, ["admin_region_id", "adminRegionId"]),
            client_id=_first_value(app_metadata, ["client_id", "clientId"]),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("get_current_user failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to resolve user identity",
        ) from exc
