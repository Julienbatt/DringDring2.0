"""Tests for backend/app/core/phone.py"""

import pytest

from app.core.phone import is_valid_swiss_phone, normalize_phone


# ── normalize_phone ──────────────────────────────────────────────────


class TestNormalizePhone:
    """Unit tests for normalize_phone()."""

    @pytest.mark.parametrize(
        "raw, expected",
        [
            # None / empty → None
            (None, None),
            ("", None),
            ("   ", None),
            # Swiss +41 format (already international)
            ("+41791234567", "+41791234567"),
            ("+41 79 123 45 67", "+41791234567"),
            ("+41-79-123-45-67", "+41791234567"),
            # Swiss 0XX local format (10 digits starting with 0)
            ("0791234567", "+41791234567"),
            ("079 123 45 67", "+41791234567"),
            # Swiss 00XX format (double-zero international prefix)
            ("0041791234567", "+41791234567"),
            ("0041 79 123 45 67", "+41791234567"),
            # Raw digits starting with 41 (no prefix)
            ("41791234567", "+41791234567"),
            # Non-Swiss international number via 00 prefix
            ("0033612345678", "+33612345678"),
            # Non-Swiss international number via + prefix
            ("+33612345678", "+33612345678"),
        ],
        ids=[
            "None",
            "empty-string",
            "whitespace-only",
            "plus41-compact",
            "plus41-spaces",
            "plus41-dashes",
            "0XX-compact",
            "0XX-spaces",
            "00XX-compact",
            "00XX-spaces",
            "41XX-no-prefix",
            "non-swiss-00-prefix",
            "non-swiss-plus-prefix",
        ],
    )
    def test_normalize(self, raw, expected):
        assert normalize_phone(raw) == expected

    @pytest.mark.parametrize(
        "raw",
        [
            "abc",          # no digits at all after cleaning
            "12345",        # too short, doesn't start with 0/41/+
            "0123456",      # starts with 0 but only 7 digits (not 10)
        ],
        ids=["letters-only", "short-random-digits", "local-wrong-length"],
    )
    def test_invalid_inputs_return_none(self, raw):
        assert normalize_phone(raw) is None


# ── is_valid_swiss_phone ─────────────────────────────────────────────


class TestIsValidSwissPhone:
    """Unit tests for is_valid_swiss_phone()."""

    @pytest.mark.parametrize(
        "value, expected",
        [
            # Valid: +41 followed by 9 digits → 11 digits total starting with 41
            ("+41791234567", True),
            # Too short (10 digits)
            ("+4179123456", False),
            # Too long (12 digits)
            ("+417912345678", False),
            # Non-Swiss prefix
            ("+33612345678", False),
            # None / empty
            (None, False),
            ("", False),
        ],
        ids=[
            "valid-swiss",
            "too-short",
            "too-long",
            "non-swiss-prefix",
            "none",
            "empty",
        ],
    )
    def test_validation(self, value, expected):
        assert is_valid_swiss_phone(value) is expected
