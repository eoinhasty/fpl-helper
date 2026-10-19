from __future__ import annotations
import hmac
import os
import time
import collections
from fastapi import Request, Security, HTTPException
from fastapi.security import APIKeyHeader
from slowapi import Limiter


def get_real_ip(request: Request) -> str:
    """Rate-limit key. Production sits behind Cloudflare, which sets
    CF-Connecting-IP to the address it saw and overwrites any client-sent
    value. X-Forwarded-For can't be used: Render appends to whatever the client
    sent, so its first entry is client-controlled — verified 2026-10-19, six
    requests with different fake values all passed a 5/min limit. Without
    Cloudflare (local dev) the direct peer address is the client."""
    cf = request.headers.get("cf-connecting-ip")
    if cf:
        return cf.strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=get_real_ip)

_API_KEY_HEADER = APIKeyHeader(name="X-Api-Key", auto_error=False)
_API_SECRET = os.getenv("API_SECRET", "")


async def verify_api_key(api_key: str = Security(_API_KEY_HEADER)):
    if _API_SECRET and not hmac.compare_digest(api_key or "", _API_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")


# Tracks per-IP noCache call timestamps for tight force-refresh limiting
_nocache_log: dict[str, list[float]] = collections.defaultdict(list)
_NOCACHE_WINDOW = 60.0
_NOCACHE_MAX = 5
_nocache_last_sweep = 0.0


def _sweep_nocache_log(now: float) -> None:
    """Drop IPs with no force-refresh inside the window. Each IP's own list
    is pruned on its next request, but the outer dict never was, so it grew
    by one key per unique client IP for the life of the process."""
    global _nocache_last_sweep
    if now - _nocache_last_sweep < _NOCACHE_WINDOW:
        return
    _nocache_last_sweep = now
    for ip in [
        ip
        for ip, log in _nocache_log.items()
        if not log or now - log[-1] >= _NOCACHE_WINDOW
    ]:
        del _nocache_log[ip]


async def nocache_guard(request: Request, noCache: int = 0) -> None:
    if not noCache:
        return
    ip = get_real_ip(request)
    now = time.time()
    _sweep_nocache_log(now)
    log = _nocache_log[ip]
    log[:] = [t for t in log if now - t < _NOCACHE_WINDOW]
    if len(log) >= _NOCACHE_MAX:
        raise HTTPException(status_code=429, detail="Too many force-refresh requests")
    log.append(now)
