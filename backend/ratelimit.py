"""
Small per-visitor rate limiter, no extra packages.

Counts requests in memory, per IP address and per route name. On Vercel each
server instance keeps its own count and resets when it restarts, so this slows
down abuse but is not a hard guarantee. A shared store (for example Upstash
Redis) would be the next step for a real launch.
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_hits = defaultdict(deque)
_MAX_KEYS = 5000


def limit(name: str, max_calls: int, per_seconds: int):
    def check(request: Request):
        forwarded = request.headers.get("x-forwarded-for", "")
        ip = forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")
        now = time.monotonic()

        if len(_hits) > _MAX_KEYS:
            _hits.clear()

        q = _hits[(name, ip)]
        while q and now - q[0] > per_seconds:
            q.popleft()
        if len(q) >= max_calls:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait a few minutes and try again.",
            )
        q.append(now)

    return check
