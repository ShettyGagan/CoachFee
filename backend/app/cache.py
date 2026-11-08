"""High-performance thread-safe In-Memory TTL Cache.

Features:
- Zero external dependencies (no Redis server or driver required).
- Per-key TTL expiration with automatic size-based eviction.
- Thread-safe operations with threading.RLock.
- JSON serialization returning fresh copies to prevent accidental in-place mutations.
- Pattern-based cache invalidation (e.g. `cache.delete_pattern("dashboard:*")`).
- Optional `@cached(prefix, ttl)` decorator for endpoints and services.
"""
from __future__ import annotations

import fnmatch
import functools
import json
import logging
import threading
import time
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Callable
from uuid import UUID

logger = logging.getLogger("coaching.cache")


class CacheJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder for caching datetimes, dates, decimals, and Pydantic models."""

    def default(self, obj: Any) -> Any:
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, UUID):
            return str(obj)
        if hasattr(obj, "model_dump"):
            return obj.model_dump()
        if hasattr(obj, "dict"):
            return obj.dict()
        return super().default(obj)


class InMemoryCache:
    """Thread-safe in-memory cache with per-key TTL expiration."""

    def __init__(self, max_items: int = 3000):
        self._store: dict[str, tuple[str, float]] = {}  # key -> (json_str, expires_at)
        self._lock = threading.RLock()
        self._max_items = max_items
        self.hits = 0
        self.misses = 0

    def _purge_expired(self) -> None:
        """Evict expired items from storage."""
        now = time.time()
        expired_keys = [k for k, (_, exp) in self._store.items() if exp < now]
        for k in expired_keys:
            self._store.pop(k, None)

    def get(self, key: str) -> Any | None:
        """Retrieve a value from cache if it exists and has not expired."""
        now = time.time()
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                self.misses += 1
                return None
            val_json, expires_at = entry
            if expires_at < now:
                self._store.pop(key, None)
                self.misses += 1
                return None
            self.hits += 1
            try:
                return json.loads(val_json)
            except Exception:
                return None

    def set(self, key: str, value: Any, ttl: int = 60) -> None:
        """Store a value in cache with a TTL in seconds."""
        val_json = json.dumps(value, cls=CacheJSONEncoder)
        now = time.time()
        expires_at = now + ttl
        with self._lock:
            if len(self._store) >= self._max_items:
                self._purge_expired()
                if len(self._store) >= self._max_items:
                    # Pop oldest 10%
                    to_remove = list(self._store.keys())[: (self._max_items // 10)]
                    for k in to_remove:
                        self._store.pop(k, None)
            self._store[key] = (val_json, expires_at)

    def delete(self, key: str) -> None:
        """Delete a single key from cache."""
        with self._lock:
            self._store.pop(key, None)

    def delete_pattern(self, pattern: str) -> int:
        """Invalidate all keys matching pattern (e.g. 'dashboard:*', 'academics:*')."""
        count = 0
        with self._lock:
            matching = [k for k in self._store.keys() if fnmatch.fnmatch(k, pattern)]
            for k in matching:
                self._store.pop(k, None)
                count += 1
        return count

    def clear(self) -> None:
        """Clear all cached keys."""
        with self._lock:
            self._store.clear()

    def stats(self) -> dict[str, Any]:
        """Return diagnostic metrics."""
        with self._lock:
            self._purge_expired()
            return {
                "engine": "in_memory",
                "keys_count": len(self._store),
                "hits": self.hits,
                "misses": self.misses,
            }


# Global cache instance
cache = InMemoryCache()


def cached(
    prefix: str,
    ttl: int = 60,
    key_builder: Callable[..., str] | None = None,
):
    """Decorator to cache function results with key pattern: `{prefix}:{args}`."""

    def decorator(fn: Callable[..., Any]):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            if key_builder:
                cache_key = f"{prefix}:{key_builder(*args, **kwargs)}"
            else:
                arg_strs = []
                for a in args:
                    if hasattr(a, "execute") or hasattr(a, "headers"):
                        continue
                    arg_strs.append(str(a))
                for k, v in sorted(kwargs.items()):
                    if k in ("db", "session", "request", "principal"):
                        continue
                    arg_strs.append(f"{k}={v}")
                cache_key = f"{prefix}:{':'.join(arg_strs) if arg_strs else 'default'}"

            hit = cache.get(cache_key)
            if hit is not None:
                return hit

            result = fn(*args, **kwargs)

            if result is not None:
                cache.set(cache_key, result, ttl=ttl)

            return result

        return wrapper

    return decorator
