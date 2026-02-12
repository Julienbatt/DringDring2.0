import pytest
from fastapi import HTTPException

from app.core.guards import (
    require_admin_or_city_user,
    require_admin_user,
    require_dispatch_user,
    require_tariff_reader,
)
from app.schemas.me import MeResponse


@pytest.fixture
def mock_resolve_identity(mocker):
    return mocker.patch("app.core.guards.resolve_identity")


def _identity(role: str, **kwargs) -> MeResponse:
    return MeResponse(user_id="u1", email="u1@example.com", role=role, **kwargs)


@pytest.mark.parametrize(
    "identity",
    [
        _identity("admin_region", admin_region_id="ar1"),
        _identity("super_admin"),
        _identity("courier", can_dispatch=True),
    ],
)
def test_require_dispatch_user_allows_expected_roles(
    mock_resolve_identity, mock_current_user, mock_user_claims, identity
):
    mock_resolve_identity.return_value = identity
    result = require_dispatch_user(mock_current_user, mock_user_claims)
    assert result.role == identity.role


@pytest.mark.parametrize(
    "identity",
    [
        _identity("courier", can_dispatch=False),
        _identity("shop", shop_id="s1"),
    ],
)
def test_require_dispatch_user_blocks_unauthorized_roles(
    mock_resolve_identity, mock_current_user, mock_user_claims, identity
):
    mock_resolve_identity.return_value = identity
    with pytest.raises(HTTPException) as exc:
        require_dispatch_user(mock_current_user, mock_user_claims)
    assert exc.value.status_code == 403


def test_require_admin_user_allows_admin_and_super(
    mock_resolve_identity, mock_current_user, mock_user_claims
):
    for identity in (_identity("admin_region", admin_region_id="ar1"), _identity("super_admin")):
        mock_resolve_identity.return_value = identity
        result = require_admin_user(mock_current_user, mock_user_claims)
        assert result.role == identity.role


def test_require_admin_user_blocks_non_admin(
    mock_resolve_identity, mock_current_user, mock_user_claims
):
    mock_resolve_identity.return_value = _identity("hq", hq_id="hq1")
    with pytest.raises(HTTPException) as exc:
        require_admin_user(mock_current_user, mock_user_claims)
    assert exc.value.status_code == 403


def test_require_admin_or_city_user_validates_city_id(
    mock_resolve_identity, mock_current_user, mock_user_claims
):
    mock_resolve_identity.return_value = _identity("city", city_id="c1")
    assert require_admin_or_city_user(mock_current_user, mock_user_claims).city_id == "c1"

    mock_resolve_identity.return_value = _identity("city")
    with pytest.raises(HTTPException) as exc:
        require_admin_or_city_user(mock_current_user, mock_user_claims)
    assert exc.value.status_code == 403


@pytest.mark.parametrize(
    "identity",
    [
        _identity("admin_region", admin_region_id="ar1"),
        _identity("super_admin"),
        _identity("hq", hq_id="hq1"),
        _identity("city", city_id="c1"),
        _identity("shop", shop_id="s1"),
    ],
)
def test_require_tariff_reader_allows_supported_roles(
    mock_resolve_identity, mock_current_user, mock_user_claims, identity
):
    mock_resolve_identity.return_value = identity
    result = require_tariff_reader(mock_current_user, mock_user_claims)
    assert result.role == identity.role


@pytest.mark.parametrize(
    "identity",
    [
        _identity("customer", client_id="cl1"),
        _identity("admin_region"),
        _identity("hq"),
        _identity("city"),
        _identity("shop"),
    ],
)
def test_require_tariff_reader_blocks_invalid_or_incomplete_context(
    mock_resolve_identity, mock_current_user, mock_user_claims, identity
):
    mock_resolve_identity.return_value = identity
    with pytest.raises(HTTPException) as exc:
        require_tariff_reader(mock_current_user, mock_user_claims)
    assert exc.value.status_code == 403
