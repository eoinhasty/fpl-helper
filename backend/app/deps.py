from __future__ import annotations
import os
import time
import collections
from fastapi import Request, Security, HTTPException
from fastapi.security import APIKeyHeader
from slowapi import Limiter


def get_real_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host or "unknown")


limiter = Limiter(key_func=get_real_ip)

_API_KEY_HEADER = APIKeyHeader(name="X-Api-Key", auto_error=False)
_API_SECRET = os.getenv("API_SECRET", "")


async def verify_api_key(api_key: str = Security(_API_KEY_HEADER)):
    if _API_SECRET and api_key != _API_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


# Tracks per-IP noCache call timestamps for tight force-refresh limiting
_nocache_log: dict[str, list[float]] = collections.defaultdict(list)
_NOCACHE_WINDOW = 60.0
_NOCACHE_MAX = 5


async def nocache_guard(request: Request, noCache: int = 0) -> None:
    if not noCache:
        return
    ip = get_real_ip(request)
    now = time.time()
    log = _nocache_log[ip]
    log[:] = [t for t in log if now - t < _NOCACHE_WINDOW]
    if len(log) >= _NOCACHE_MAX:
        raise HTTPException(status_code=429, detail="Too many force-refresh requests")
    log.append(now)
