"""Tests for the in-memory rate limiter."""

import pytest
from fastapi import HTTPException

from app.core.rate_limit import RateLimiter


class TestRateLimiter:
    def test_allows_requests_under_limit(self):
        limiter = RateLimiter(max_requests=5, window_seconds=60)
        for _ in range(5):
            limiter.check("client-1")  # Should not raise

    def test_rejects_over_limit(self):
        limiter = RateLimiter(max_requests=3, window_seconds=60)
        for _ in range(3):
            limiter.check("client-1")
        with pytest.raises(HTTPException) as exc_info:
            limiter.check("client-1")
        assert exc_info.value.status_code == 429

    def test_separate_keys_are_independent(self):
        limiter = RateLimiter(max_requests=2, window_seconds=60)
        limiter.check("client-1")
        limiter.check("client-1")
        # client-1 is at limit, but client-2 should be fine
        limiter.check("client-2")

    def test_expired_entries_are_cleaned(self):
        limiter = RateLimiter(max_requests=2, window_seconds=1)
        limiter.check("client-1")
        limiter.check("client-1")
        # Manually expire all entries
        import time
        limiter._hits["client-1"] = [time.monotonic() - 2]
        # Should now allow again
        limiter.check("client-1")
