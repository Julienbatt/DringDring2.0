from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.core import security


def test_get_current_user_claims_returns_payload_json(mocker):
    mocker.patch(
        "app.core.security._decode_jwt",
        return_value={"sub": "user-1", "email": "u@example.com", "app_metadata": {"role": "shop"}},
    )
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")

    claims = security.get_current_user_claims(creds)
    assert '"sub": "user-1"' in claims
    assert '"role": "shop"' in claims


def test_get_current_user_claims_returns_500_on_unexpected_decode_error(mocker):
    mocker.patch("app.core.security._decode_jwt", side_effect=ValueError("boom"))
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")

    try:
        security.get_current_user_claims(creds)
        assert False, "Expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 500
        assert exc.detail == "Authentication service unavailable"


def test_get_current_user_returns_401_from_decode(mocker):
    mocker.patch(
        "app.core.security._decode_jwt",
        side_effect=HTTPException(status_code=401, detail="Could not validate credentials"),
    )
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")

    try:
        security.get_current_user(creds)
        assert False, "Expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 401


def test_get_current_user_returns_500_on_unexpected_decode_error(mocker):
    mocker.patch("app.core.security._decode_jwt", side_effect=RuntimeError("boom"))
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")

    try:
        security.get_current_user(creds)
        assert False, "Expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 500
        assert exc.detail == "Unable to resolve user identity"
