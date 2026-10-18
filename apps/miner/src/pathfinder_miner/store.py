"""Read-only access to a Pathfinder store (constitution: Python never writes the DB)."""

from __future__ import annotations

import sqlite3
from pathlib import Path


def open_read_only(path: Path) -> sqlite3.Connection:
    """Open `path` read-only (`mode=ro`); a missing file is an error, never a new store."""
    if not path.is_file():
        raise FileNotFoundError(f"no store at {path}")
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)
