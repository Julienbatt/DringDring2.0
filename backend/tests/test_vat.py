"""Tests for backend/app/core/vat.py"""

import importlib
import sys
from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture()
def vat():
    """Return a freshly-loaded vat module with settings patched."""
    fake_settings = MagicMock()
    fake_settings.DEFAULT_VAT_RATE = 0.081

    with patch("app.core.config.settings", fake_settings):
        # Remove cached module so reload picks up the patched settings
        sys.modules.pop("app.core.vat", None)
        import app.core.vat as vat_mod
        importlib.reload(vat_mod)
        yield vat_mod

    # Clean up so other test files are not affected
    sys.modules.pop("app.core.vat", None)


@pytest.fixture()
def cursor():
    return MagicMock()


# ── DEFAULT_VAT_RATE ─────────────────────────────────────────────────


class TestDefaultVatRate:
    def test_is_decimal(self, vat):
        assert isinstance(vat.DEFAULT_VAT_RATE, Decimal)

    def test_value(self, vat):
        assert vat.DEFAULT_VAT_RATE == Decimal("0.081")


# ── get_vat_rate ─────────────────────────────────────────────────────


class TestGetVatRate:
    """Unit tests for get_vat_rate() with a mock DB cursor."""

    def test_table_does_not_exist_returns_default(self, vat, cursor):
        # to_regclass returns (None,) when the table doesn't exist
        cursor.fetchone.return_value = (None,)
        result = vat.get_vat_rate(cursor, date(2025, 3, 1))
        assert result == Decimal("0.081")

    def test_table_missing_row_returns_none_tuple(self, vat, cursor):
        # to_regclass returns None entirely (no row)
        cursor.fetchone.return_value = None
        result = vat.get_vat_rate(cursor, date(2025, 3, 1))
        assert result == Decimal("0.081")

    def test_table_exists_but_no_row_returns_default(self, vat, cursor):
        # First call: table exists; second call: no matching row
        cursor.fetchone.side_effect = [("app_settings",), None]
        result = vat.get_vat_rate(cursor, date(2025, 3, 1))
        assert result == Decimal("0.081")

    def test_table_exists_row_value_is_none_returns_default(self, vat, cursor):
        cursor.fetchone.side_effect = [("app_settings",), (None,)]
        result = vat.get_vat_rate(cursor, date(2025, 3, 1))
        assert result == Decimal("0.081")

    def test_table_exists_with_row_returns_db_value(self, vat, cursor):
        cursor.fetchone.side_effect = [("app_settings",), (0.077,)]
        result = vat.get_vat_rate(cursor, date(2025, 6, 1))
        assert result == Decimal("0.077")

    def test_executes_correct_queries(self, vat, cursor):
        cursor.fetchone.side_effect = [("app_settings",), (0.077,)]
        period = date(2025, 3, 1)
        vat.get_vat_rate(cursor, period)

        calls = cursor.execute.call_args_list
        assert len(calls) == 2
        # First query checks table existence
        assert "to_regclass" in calls[0].args[0]
        # Second query fetches the rate
        assert "vat_rate" in calls[1].args[0]
        assert calls[1].args[1] == (period,)
