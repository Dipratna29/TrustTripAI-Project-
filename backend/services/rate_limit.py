"""
Simple sliding-window rate limiter (per process). Good enough to blunt abuse of costly
endpoints (OCR, password reset requests) on a small deployment; security-critical
limits (OTP attempts) are additionally enforced in the database.
"""

import threading
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, max_calls: int, window_seconds: int):
        self.max_calls = max_calls
        self.window = window_seconds
        self._calls = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._calls[key]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.max_calls:
                return False
            q.append(now)
            return True

    def reset(self):
        with self._lock:
            self._calls.clear()
