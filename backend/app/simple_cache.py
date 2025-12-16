from __future__ import annotations
import asyncio, time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple

@dataclass
class CacheEntry:
    data: Any
    created_at: float
    fresh_until: float
    stale_until: float

class AsyncCache:
    """
    Minimal async cache with:
      - TTL (fresh) + stale-while-revalidate
      - Request coalescing (one in-flight per key)
      - Optional forced refresh (for 'Refresh' button)
    Keep it simple and readable.
    """
    def __init__(self):
        self._store: Dict[str, CacheEntry] = {}
        self._locks: Dict[str, asyncio.Lock] = {}
        self._bg: Dict[str, asyncio.Task] = {}

    def _lock(self, key: str) -> asyncio.Lock:
        if key not in self._locks:
            self._locks[key] = asyncio.Lock()
        return self._locks[key]

    def _now(self) -> float:
        return time.time()

    def set(self, key: str, data: Any, ttl: float, stale_ttl: Optional[float] = None) -> None:
        if stale_ttl is None:
            stale_ttl = ttl * 2
        now = self._now()
        self._store[key] = CacheEntry(
            data=data,
            created_at=now,
            fresh_until=now + ttl,
            stale_until=now + stale_ttl,
        )

    def get_meta(self, key: str) -> Tuple[Optional[CacheEntry], float]:
        entry = self._store.get(key)
        return entry, (self._now() - entry.created_at) if entry else (None, 0.0)

    async def get_or_set(
        self,
        key: str,
        fetcher: Callable[[], Awaitable[Any]],
        ttl: float,
        stale_ttl: Optional[float] = None,
    ) -> Tuple[Any, str, float]:
        """
        Returns (data, status, age_seconds)
        status: 'hit' | 'miss' | 'stale-serve' | 'refreshing'
        """
        entry, age = self.get_meta(key)
        now = self._now()

        if stale_ttl is None:
            stale_ttl = ttl * 2

        # Fresh hit
        if entry and now < entry.fresh_until:
            return entry.data, "hit", age

        # Stale serve + background refresh
        if entry and now < entry.stale_until:
            if key not in self._bg:  # start one background refresh
                async def _bg():
                    try:
                        data = await fetcher()
                        self.set(key, data, ttl, stale_ttl)
                    finally:
                        self._bg.pop(key, None)
                self._bg[key] = asyncio.create_task(_bg())
            return entry.data, "stale-serve", age

        # Miss → fetch (coalesced)
        lock = self._lock(key)
        async with lock:
            # Another waiter may have filled it:
            entry2, age2 = self.get_meta(key)
            now = self._now()
            if entry2 and now < entry2.fresh_until:
                return entry2.data, "hit", age2

            data = await fetcher()
            self.set(key, data, ttl, stale_ttl)
            return data, "miss", 0.0

    async def refresh(
        self,
        key: str,
        fetcher: Callable[[], Awaitable[Any]],
        ttl: float,
        stale_ttl: Optional[float] = None,
    ) -> Tuple[Any, str, float]:
        """
        Force a refresh (for a user 'Refresh' click). Still coalesces.
        """
        lock = self._lock(key)
        async with lock:
            data = await fetcher()
            self.set(key, data, ttl, stale_ttl)
            _, age = self.get_meta(key)
            return data, "bypass-refresh", age
