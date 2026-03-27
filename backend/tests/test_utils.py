"""Tests for backend/app/core/utils.py"""

from datetime import date
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.core.utils import parse_month, split_address_parts


# ── parse_month ──────────────────────────────────────────────────────


class TestParseMonth:
    """Unit tests for parse_month()."""

    def test_none_returns_first_of_current_month(self):
        fake_today = date(2025, 7, 15)
        with patch("app.core.utils.date") as mock_date:
            mock_date.today.return_value = fake_today
            mock_date.side_effect = lambda *a, **kw: date(*a, **kw)
            result = parse_month(None)
        assert result == date(2025, 7, 1)

    def test_empty_string_returns_first_of_current_month(self):
        fake_today = date(2026, 1, 20)
        with patch("app.core.utils.date") as mock_date:
            mock_date.today.return_value = fake_today
            mock_date.side_effect = lambda *a, **kw: date(*a, **kw)
            result = parse_month("")
        assert result == date(2026, 1, 1)

    @pytest.mark.parametrize(
        "month_str, expected",
        [
            ("2025-03", date(2025, 3, 1)),
            ("2024-12", date(2024, 12, 1)),
            ("2026-01", date(2026, 1, 1)),
        ],
        ids=["march-2025", "december-2024", "january-2026"],
    )
    def test_valid_month_string(self, month_str, expected):
        assert parse_month(month_str) == expected

    @pytest.mark.parametrize(
        "bad_input",
        [
            "not-a-date",
            "2025/03",
            "03-2025",
            "2025",
            "2025-13",
        ],
        ids=["garbage", "wrong-separator", "reversed", "year-only", "month-13"],
    )
    def test_invalid_format_raises_http_400(self, bad_input):
        with pytest.raises(HTTPException) as exc_info:
            parse_month(bad_input)
        assert exc_info.value.status_code == 400
        assert "Invalid month format" in exc_info.value.detail


# ── split_address_parts ──────────────────────────────────────────────


class TestSplitAddressParts:
    """Unit tests for split_address_parts()."""

    @pytest.mark.parametrize(
        "value, expected",
        [
            # None / empty → (None, None)
            (None, (None, None)),
            ("", (None, None)),
            ("   ", (None, None)),
            # Street-first pattern: "Rue de Berne 12"
            ("Rue de Berne 12", ("Rue de Berne", "12")),
            # Number-first pattern: "12 Rue de Berne"
            ("12 Rue de Berne", ("Rue de Berne", "12")),
            # House number with letter suffix
            ("Hauptstrasse 5A", ("Hauptstrasse", "5A")),
            ("5A Hauptstrasse", ("Hauptstrasse", "5A")),
            # No house number → (address, None)
            ("Rue de Berne", ("Rue de Berne", None)),
            # Number with slash
            ("Avenue de la Gare 10/12", ("Avenue de la Gare", "10/12")),
        ],
        ids=[
            "none",
            "empty",
            "whitespace",
            "street-first",
            "number-first",
            "number-with-letter-street-first",
            "number-with-letter-number-first",
            "no-house-number",
            "number-with-slash",
        ],
    )
    def test_split(self, value, expected):
        assert split_address_parts(value) == expected
