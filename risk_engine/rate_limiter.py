"""Lightweight, dependency-free sliding-window rate limiter.

Protects sensitive endpoints (prediction scoring, OTP request/verify)
against repeated automated abuse without an external cache/service. This
is intentionally simple (in-process, in-memory) — appropriate for a
single-instance Buildathon demo, not a distributed production deployment,
which is disclosed rather than hidden.

Uses progressive, per-action limits rather than one arbitrary global rule,
per the "balance security and genuine-user usability" principle: a
transaction-scoring endpoint tolerates much higher legitimate traffic than
an OTP-request endpoint, which a genuine user calls at most a few times.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque


class SlidingWindowRateLimiter:
    def __init__(self, max_requests: int, window_seconds: float):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)

    def check(self, key: str) -> tuple[bool, int, float]:
        """Returns (allowed, remaining, retry_after_seconds).
        Records the hit only if allowed, so a client hammering a limited
        endpoint doesn't get to "waste" a slot by being rejected.
        """
        now = time.monotonic()
        window = self._hits[key]

        while window and now - window[0] > self.window_seconds:
            window.popleft()

        if len(window) >= self.max_requests:
            retry_after = self.window_seconds - (now - window[0])
            return False, 0, max(retry_after, 0.0)

        window.append(now)
        remaining = self.max_requests - len(window)
        return True, remaining, 0.0

    def reset(self, key: str | None = None) -> None:
        if key is None:
            self._hits.clear()
        else:
            self._hits.pop(key, None)


# Named limiters for each protected surface, with deliberately different
# budgets reflecting how often a genuine user legitimately calls each one.
predict_limiter = SlidingWindowRateLimiter(max_requests=60, window_seconds=60.0)
otp_request_limiter = SlidingWindowRateLimiter(max_requests=3, window_seconds=600.0)
otp_verify_limiter = SlidingWindowRateLimiter(max_requests=5, window_seconds=600.0)
