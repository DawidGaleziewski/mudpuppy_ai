"""A scan's step limit, from its config snapshot (spec 022 T030); the Scans page's read models are
in `queries_app.py`."""

from __future__ import annotations

import json
import sqlite3

from .models import Run


def run_max_steps(conn: sqlite3.Connection, run_id: str) -> int | None:
    """A run's step limit by its id (the live Workbench's meter, spec 075); None when unknown."""
    row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
    return max_steps(Run.model_validate(dict(row))) if row else None


def max_steps(run: Run) -> int | None:
    snapshot = run.config_snapshot
    try:
        value = (json.loads(snapshot) if isinstance(snapshot, str) else snapshot)["portal"][
            "scope"
        ]["max_steps"]
    except (ValueError, KeyError, TypeError):
        return None
    return value if isinstance(value, int) and value > 0 else None
