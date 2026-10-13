"""Read models for Scans (spec 022 screen 10, T030): the live monitor of a portal's running scan
(or its newest one), the history with what each scan changed, and the counts for the page head.
Read-only; each read gives nothing on a store older than the table it needs (screens, 0015)."""

from __future__ import annotations

import json
import sqlite3
from typing import Any, NamedTuple

from .models import Run

ROUTES_SHOWN = 24  # the route list of the monitor; the rest is a count
HISTORY_LIMIT = 100


class ChangedScreen(NamedTuple):
    state_id: str
    route: str
    title: str
    rev: int


class Changes(NamedTuple):
    new_screens: list[ChangedScreen]  # r1 first seen in this scan
    changed_screens: list[ChangedScreen]  # r2, r3, ... first seen in this scan
    reanchor: int  # amendments this scan flagged needs_reanchor
    baseline: bool  # the portal's first scan: everything is new

    @property
    def empty(self) -> bool:
        return not (self.new_screens or self.changed_screens or self.reanchor)


class HistoryRow(NamedTuple):
    run: Run
    pages: int
    changes: Changes


class Monitor(NamedTuple):
    run: Run
    pages: int
    queued: int
    max_steps: int | None
    routes: list[str]  # pages seen, in order, newest last
    routes_total: int
    last_route: str | None

    @property
    def running(self) -> bool:
        return self.run.status == "running"

    @property
    def percent(self) -> float:
        if not self.max_steps:
            return 0.0
        return round(min(100.0, 100.0 * self.run.steps_used / self.max_steps), 2)


class Counts(NamedTuple):
    total: int
    running: int
    interrupted: int
    completed: int
    other: int


def _rows(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []


def _max_steps(run: Run) -> int | None:
    snapshot = run.config_snapshot
    try:
        value = (json.loads(snapshot) if isinstance(snapshot, str) else snapshot)["portal"][
            "scope"
        ]["max_steps"]
    except (ValueError, KeyError, TypeError):
        return None
    return value if isinstance(value, int) and value > 0 else None


def counts(conn: sqlite3.Connection, portal: str) -> Counts:
    by = {
        r[0]: r[1]
        for r in _rows(
            conn, "SELECT status, count(*) FROM runs WHERE portal_id = ? GROUP BY status", (portal,)
        )
    }
    known = by.get("running", 0) + by.get("interrupted", 0) + by.get("completed", 0)
    return Counts(
        sum(by.values()),
        by.get("running", 0),
        by.get("interrupted", 0),
        by.get("completed", 0),
        sum(by.values()) - known,
    )


def _runs(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[Run]:
    return [Run.model_validate(dict(r)) for r in _rows(conn, sql, args)]


def monitor(conn: sqlite3.Connection, portal: str) -> list[Monitor]:
    """Every running scan of the portal, newest first; when none runs, the newest scan alone
    (so a stopped one still shows where it stopped)."""
    runs = _runs(
        conn,
        "SELECT * FROM runs WHERE portal_id = ? AND status = 'running' ORDER BY started_at DESC",
        (portal,),
    ) or _runs(
        conn,
        "SELECT * FROM runs WHERE portal_id = ? ORDER BY started_at DESC, id DESC LIMIT 1",
        (portal,),
    )
    return [_monitor_of(conn, run) for run in runs]


def _monitor_of(conn: sqlite3.Connection, run: Run) -> Monitor:
    seen = _rows(
        conn,
        "SELECT s.route_template FROM state_observations o JOIN states s ON s.id = o.state_id"
        " WHERE o.run_id = ? ORDER BY o.observed_at, s.id",
        (run.id,),
    )
    queued = _rows(
        conn, "SELECT count(*) FROM frontier WHERE run_id = ? AND status = 'pending'", (run.id,)
    )
    routes = [r[0] for r in seen]
    return Monitor(
        run=run,
        pages=len(routes),
        queued=int(queued[0][0]) if queued else 0,
        max_steps=_max_steps(run),
        routes=routes[:ROUTES_SHOWN],
        routes_total=len(routes),
        last_route=routes[-1] if routes else None,
    )


def _changed_by_run(conn: sqlite3.Connection, portal: str) -> dict[str, list[ChangedScreen]]:
    rows = _rows(
        conn,
        "SELECT id, first_seen_run, route_template, title, screen_rev FROM states"
        " WHERE portal_id = ? AND screen_id IS NOT NULL ORDER BY route_template, screen_rev",
        (portal,),
    )
    out: dict[str, list[ChangedScreen]] = {}
    for r in rows:
        out.setdefault(r["first_seen_run"], []).append(
            ChangedScreen(r["id"], r["route_template"], r["title"], r["screen_rev"] or 1)
        )
    return out


def _flagged_by_run(conn: sqlite3.Connection, portal: str) -> dict[str, int]:
    return {
        r[0]: r[1]
        for r in _rows(
            conn,
            "SELECT superseded_by_run, count(*) FROM amendments WHERE portal_id = ?"
            " AND status = 'needs_reanchor' AND superseded_by_run IS NOT NULL"
            " GROUP BY superseded_by_run",
            (portal,),
        )
    }


def history(conn: sqlite3.Connection, portal: str, limit: int = HISTORY_LIMIT) -> list[HistoryRow]:
    """The portal's scans, newest first, with pages recorded and what each one changed."""
    runs = _runs(
        conn,
        "SELECT * FROM runs WHERE portal_id = ? ORDER BY started_at DESC, id DESC LIMIT ?",
        (portal, limit),
    )
    pages = {
        r[0]: r[1]
        for r in _rows(
            conn,
            "SELECT o.run_id, count(*) FROM state_observations o JOIN runs r ON r.id = o.run_id"
            " WHERE r.portal_id = ? GROUP BY o.run_id",
            (portal,),
        )
    }
    changed = _changed_by_run(conn, portal)
    flagged = _flagged_by_run(conn, portal)
    first = _rows(
        conn, "SELECT id FROM runs WHERE portal_id = ? ORDER BY started_at, id LIMIT 1", (portal,)
    )
    first_id = first[0][0] if first else None
    rows = []
    for run in runs:
        found = changed.get(run.id, [])
        rows.append(
            HistoryRow(
                run,
                pages.get(run.id, 0),
                Changes(
                    [s for s in found if s.rev == 1],
                    [s for s in found if s.rev > 1],
                    flagged.get(run.id, 0),
                    run.id == first_id,
                ),
            )
        )
    return rows
