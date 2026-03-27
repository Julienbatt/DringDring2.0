import time
from collections import defaultdict

from fastapi import HTTPException


class RateLimiter:
    """Simple in-memory rate limiter (per-key, sliding window)."""

    def __init__(self, max_requests: int = 10, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        # Remove expired entries
        self._hits[key] = [t for t in hits if now - t < self.window]
        if len(self._hits[key]) >= self.max_requests:
            raise HTTPException(status_code=429, detail="Too many requests")
        self._hits[key].append(now)
