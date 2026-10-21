"""Home of one portal (spec 039 T100, designer screen v2-01, UX-R01–R03): the latest release of
each portal part and the last scan, what needs a person (the Review queue's count and top five),
what changed by process, and the counts of processes and rules. Composed from the other read
models; read-only."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Any

from . import queries_review
from .queries_changes import ChangesView, changes_view, rows_of
from .queries_queue import QueueItem
from .queries_releases import Timeline, timeline
from .queries_rules import RulesView, rules_view


@dataclass(frozen=True)
class LastScan:
    id: str
    started_at: str
    status: str
    check: bool
    steps: int


@dataclass(frozen=True)
class PortalHome:
    portal: str
    model_seq: int | None
    model_built_at: str | None
    timeline: Timeline | None
    last_scan: LastScan | None
    inbox: queries_review.Inbox
    top: list[tuple[str, QueueItem]]  # (group, item): broken rules first, then the model's groups
    changes: ChangesView
    rules: RulesView
    processes: int
    proposed: int


def _top(inbox: queries_review.Inbox, n: int = 5) -> list[tuple[str, QueueItem]]:
    broken = [("rules", r) for r in inbox.rules if r.status == "broken"]
    rest = [
        (k, i)
        for k in ("rules", "findings", "removals", "processes")
        for i in getattr(inbox, k)
        if (k, i) not in broken
    ]
    return (broken + rest)[:n]


def _last_scan(conn: sqlite3.Connection, portal: str) -> LastScan | None:
    rows = rows_of(
        conn,
        "SELECT id, started_at, status, mode, steps_used FROM runs WHERE portal_id = ?"
        " ORDER BY started_at DESC, id DESC LIMIT 1",
        (portal,),
    )
    if not rows:
        return None
    r = rows[0]
    return LastScan(r["id"], r["started_at"], r["status"], r["mode"] == "probe", r["steps_used"])


def _count(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> int:
    rows = rows_of(conn, sql, args)
    return int(rows[0][0]) if rows else 0


def portal_home(conn: sqlite3.Connection, portal: str) -> PortalHome:
    version = rows_of(
        conn,
        "SELECT seq, built_at FROM model_versions WHERE portal_id = ? ORDER BY seq DESC LIMIT 1",
        (portal,),
    )
    inbox = queries_review.inbox(conn, portal)
    return PortalHome(
        portal=portal,
        model_seq=version[0]["seq"] if version else None,
        model_built_at=version[0]["built_at"] if version else None,
        timeline=timeline(conn, portal) if version else None,
        last_scan=_last_scan(conn, portal),
        inbox=inbox,
        top=_top(inbox),
        changes=changes_view(conn, portal),
        rules=rules_view(conn, portal, None),
        processes=_count(
            conn,
            "SELECT count(*) FROM ba_processes WHERE portal_id = ? AND archived_at IS NULL",
            (portal,),
        ),
        proposed=len(inbox.processes),
    )
