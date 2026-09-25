"""Live updates (research §3, §5): one SSE stream that says "the store changed".

Detection uses `PRAGMA data_version` on the watcher's own read-only connection; it changes
exactly when another connection (the crawler) commits. `data_version` is per connection, so it
cannot identify a state across reconnects; the event id is a fingerprint of the store files
instead, and a client reconnecting with a stale `Last-Event-ID` gets `store-changed` at once.
Each process has a `BOOT_ID`; in dev mode the page reloads when it changes (server restarted).
"""

from __future__ import annotations

import asyncio
import hashlib
import secrets
import sqlite3
import time
from collections.abc import AsyncIterator
from pathlib import Path

from fastapi.sse import ServerSentEvent

from . import db

BOOT_ID = secrets.token_hex(8)
RETRY_MS = 2000


def store_fingerprint(data_dir: Path, env: str) -> str:
    """Stable across connections: size and mtime of the store and its WAL."""
    path = db.store_path(data_dir, env)
    parts = []
    for p in (path, path.with_name(path.name + "-wal")):
        try:
            st = p.stat()
            parts.append(f"{st.st_size}:{st.st_mtime_ns}")
        except FileNotFoundError:
            parts.append("-")
    return hashlib.sha1("|".join(parts).encode()).hexdigest()[:16]


class _Watcher:
    """Holds one read-only connection; `changed()` is True after another connection commits."""

    def __init__(self, data_dir: Path, env: str) -> None:
        self.data_dir, self.env = data_dir, env
        self.conn: sqlite3.Connection | None = None
        self.version: int | None = None
        self._open()

    def _open(self) -> None:
        try:
            self.conn = db.connect(self.data_dir, self.env)
            self.version = db.data_version(self.conn)
        except (db.StoreMissing, sqlite3.Error):
            self.conn, self.version = None, None

    def changed(self) -> bool:
        if self.conn is None:
            self._open()
            return self.conn is not None  # the store appeared
        try:
            version = db.data_version(self.conn)
        except sqlite3.Error:
            self.close()
            return True
        if version != self.version:
            self.version = version
            return True
        return False

    def close(self) -> None:
        if self.conn is not None:
            self.conn.close()
        self.conn = None


async def watch(
    data_dir: Path,
    env: str,
    *,
    dev: bool = False,
    last_event_id: str | None = None,
    interval: float = 1.0,
    keepalive: float = 15.0,
    max_seconds: float | None = None,
) -> AsyncIterator[ServerSentEvent]:
    watcher = _Watcher(data_dir, env)
    try:
        fingerprint = store_fingerprint(data_dir, env)
        yield ServerSentEvent(
            event="hello",
            data={"boot_id": BOOT_ID, "data_version": watcher.version, "dev": dev},
            id=fingerprint,
            retry=RETRY_MS,
        )
        if last_event_id and last_event_id != fingerprint:
            yield ServerSentEvent(
                event="store-changed", data={"data_version": watcher.version}, id=fingerprint
            )
        started = last_ping = time.monotonic()
        while max_seconds is None or time.monotonic() - started < max_seconds:
            await asyncio.sleep(interval)
            if watcher.changed():
                yield ServerSentEvent(
                    event="store-changed",
                    data={"data_version": watcher.version},
                    id=store_fingerprint(data_dir, env),
                )
            if time.monotonic() - last_ping >= keepalive:
                last_ping = time.monotonic()
                yield ServerSentEvent(comment="ping")
    finally:
        watcher.close()
