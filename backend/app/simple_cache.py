from __future__ import annotations
import asyncio
import logging
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple

logger = logging.getLogger("uvicorn.error")

# Entries past stale_until are never served (get_or_set treats them as a
# miss), so they're dropped by a sweep that runs at most this often. The cap
# backstops the sweep: keys are per entry/gw/token/player/match, so a
# long-running server would otherwise grow one entry per combination
# forever. Least-recently-used entries go first, so hot keys like
# bootstrap-static (read on nearly every request) are never the ones evicted.
SWEEP_INTERVAL = 60.0
MAX_ENTRIES = 2000


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
      - Bounded size: expired-entry sweep + LRU cap
    Keep it simple and readable.
    """

    def __init__(self, max_entries: int = MAX_ENTRIES):
        self._store: "OrderedDict[str, CacheEntry]" = OrderedDict()
        self._locks: Dict[str, asyncio.Lock] = {}
        self._bg: Dict[str, asyncio.Task] = {}
        self._max_entries = max_entries
        self._last_sweep = 0.0

    def _lock(self, key: str) -> asyncio.Lock:
        return self._locks.setdefault(key, asyncio.Lock())

    def _now(self) -> float:
        return time.time()

    def _drop(self, key: str) -> None:
        self._store.pop(key, None)
        # Safe to discard an unheld lock: callers take it with no await
        # between _lock() and acquiring it, so nobody can be holding a
        # reference to an unlocked one across a yield.
        lock = self._locks.get(key)
        if lock is not None and not lock.locked():
            del self._locks[key]

    def _evict(self, now: float) -> None:
        if now - self._last_sweep >= SWEEP_INTERVAL:
            self._last_sweep = now
            for key in [k for k, e in self._store.items() if now >= e.stale_until]:
                self._drop(key)
            # Locks for keys whose fetch failed (nothing ever stored).
            for key in [
                k
                for k, lk in self._locks.items()
                if k not in self._store and not lk.locked()
            ]:
                del self._locks[key]
        while len(self._store) > self._max_entries:
            oldest = next(iter(self._store))
            self._drop(oldest)

    def set(
        self, key: str, data: Any, ttl: float, stale_ttl: Optional[float] = None
    ) -> None:
        if stale_ttl is None:
            stale_ttl = ttl * 2
        now = self._now()
        self._store[key] = CacheEntry(
            data=data,
            created_at=now,
            fresh_until=now + ttl,
            stale_until=now + stale_ttl,
        )
        self._store.move_to_end(key)
        self._evict(now)

    def get_meta(self, key: str) -> Tuple[Optional[CacheEntry], float]:
        entry = self._store.get(key)
        if entry is not None:
            self._store.move_to_end(key)
        return entry, (self._now() - entry.created_at if entry else 0.0)

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
                    except Exception:
                        # Nobody awaits this task, so without this the error
                        # only reaches asyncio's "exception never retrieved"
                        # handler — the entry would keep being served stale
                        # with no sign revalidation is failing, until
                        # stale_until passes and requests start erroring.
                        logger.warning(
                            "Background refresh failed for cache key %s; serving stale",
                            key,
                            exc_info=True,
                        )
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

    async def close(self) -> None:
        for task in list(self._bg.values()):
            task.cancel()
        if self._bg:
            await asyncio.gather(*self._bg.values(), return_exceptions=True)
        self._bg.clear()

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
