"""Read-only access to the crawler's SQLite store (research §2, §7).

The crawler writes `data/db/<env>.sqlite` in WAL mode. The dashboard opens it with
`mode=ro` so the process cannot write even through a bug, and sets `query_only` as a second
guard. WAL readers never block the writer.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from .models import StoreInfo


class StoreMissing(Exception):
    """The crawl store file for an environment does not exist."""

    def __init__(self, path: Path) -> None:
        super().__init__(f"No crawl store at {path}")
        self.path = path


def store_path(data_dir: Path, env: str) -> Path:
    return data_dir / "db" / f"{env}.sqlite"


def list_environments(data_dir: Path) -> list[str]:
    """Environments are the `data/db/*.sqlite` files, production first."""
    names = sorted(p.stem for p in (data_dir / "db").glob("*.sqlite"))
    return sorted(names, key=lambda n: n != "production")


def resolve_env(data_dir: Path, requested: str | None, default: str) -> str:
    envs = list_environments(data_dir)
    if requested and requested in envs:
        return requested
    if default in envs or not envs:
        return default
    return envs[0]


def connect(data_dir: Path, env: str) -> sqlite3.Connection:
    """Open the store read-only. Never creates the file (unlike a default `connect`)."""
    path = store_path(data_dir, env)
    if not path.is_file():
        raise StoreMissing(path)
    conn = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only = ON")
    conn.execute("PRAGMA busy_timeout = 2000")
    return conn


def data_version(conn: sqlite3.Connection) -> int:
    """Changes whenever another connection commits to the file (SQLite `data_version`)."""
    return conn.execute("PRAGMA data_version").fetchone()[0]


def store_info(data_dir: Path, env: str) -> StoreInfo:
    path = store_path(data_dir, env)
    return StoreInfo(
        environment=env,
        path=str(path),
        exists=path.is_file(),
        size_bytes=path.stat().st_size if path.is_file() else 0,
    )
