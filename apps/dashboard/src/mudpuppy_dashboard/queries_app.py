"""Read models of the React console's JSON API (R-96, spec 050): what `apps/web` pages read.

Read-only on the store, like every query here; one function per page. The shapes are pydantic
models so the API is typed (`/api/docs`) and the React app mirrors them in `src/app/api.ts`.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from pydantic import BaseModel

from .models import Run
from .queries_chat import portals_by_environment
from .queries_scans import max_steps


class PortalSummary(BaseModel):
    id: str
    scans: int
    running: int
    last_scan_at: str | None


class PortalList(BaseModel):
    environment: str
    portals: list[PortalSummary]
    #: Configured portals that declare another environment (R-94 (8)): listed apart.
    other_environments: list[str]


class ScanSummary(BaseModel):
    id: str
    persona: str
    mode: str
    status: str
    steps_used: int
    max_steps: int | None
    started_at: str
    ended_at: str | None
    warning: str | None


class ScanList(BaseModel):
    portal: str
    scans: list[ScanSummary]
    total: int


def _scan_counts(conn: sqlite3.Connection | None) -> dict[str, tuple[int, int, str | None]]:
    if conn is None:
        return {}
    try:
        rows = conn.execute(
            "SELECT portal_id, count(*), sum(status = 'running'), max(started_at) FROM runs"
            " GROUP BY portal_id"
        ).fetchall()
    except sqlite3.OperationalError:  # a store without runs yet
        return {}
    return {r[0]: (r[1], r[2] or 0, r[3]) for r in rows}


def portal_list(conn: sqlite3.Connection | None, portals_dir: Path, env: str) -> PortalList:
    """The store's portals with their scan counts, and the other environments' apart."""
    here, other = portals_by_environment(conn, portals_dir, env)
    counts = _scan_counts(conn)
    return PortalList(
        environment=env,
        portals=[
            PortalSummary(
                id=p,
                scans=counts.get(p, (0, 0, None))[0],
                running=counts.get(p, (0, 0, None))[1],
                last_scan_at=counts.get(p, (0, 0, None))[2],
            )
            for p in here
        ],
        other_environments=other,
    )


def scan_list(conn: sqlite3.Connection, portal: str, limit: int = 25) -> ScanList:
    """The portal's newest scans (25 a page, R-71), each with its steps and its limit."""
    rows = conn.execute(
        "SELECT * FROM runs WHERE portal_id = ? ORDER BY started_at DESC, id DESC LIMIT ?",
        (portal, limit),
    ).fetchall()
    total = conn.execute("SELECT count(*) FROM runs WHERE portal_id = ?", (portal,)).fetchone()[0]
    scans = []
    for r in rows:
        run = Run.model_validate(dict(r))
        scans.append(
            ScanSummary(
                id=run.id,
                persona=run.persona_id,
                mode=run.mode,
                status=run.status,
                steps_used=run.steps_used,
                max_steps=max_steps(run),
                started_at=run.started_at,
                ended_at=run.ended_at,
                warning=run.warning,
            )
        )
    return ScanList(portal=portal, scans=scans, total=total)
