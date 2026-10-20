"""Read models for Home beside the assistant (spec 022 screen 01, FE-A01, D-17): the portal's
conversations for the picker, what needs a person, and the processes scoped so far. Read-only;
each read gives nothing on a store older than the table it needs."""

from __future__ import annotations

import json
import sqlite3
from typing import Any, NamedTuple


class ConversationItem(NamedTuple):
    id: str
    goal: str
    created_at: str


class NeedsRow(NamedTuple):
    key: str  # what waits: resume_scan | reanchor | proposals | drafts
    label: str
    count: int


class ProcessItem(NamedTuple):
    name: str
    persona: str
    screens: int
    start_route: str
    end_route: str
    created_at: str
    key: str | None = None  # PRC-nnn; None for a scope of a store before 0018
    stage: str = "scoped"


def _rows(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []


def _count(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> int:
    rows = _rows(conn, sql, args)
    return int(rows[0][0]) if rows else 0


def conversations(
    conn: sqlite3.Connection, portal: str | None, limit: int = 20
) -> list[ConversationItem]:
    """The portal's active conversations, newest first (the picker)."""
    rows = _rows(
        conn,
        "SELECT id, goal, created_at FROM chat_conversations WHERE status = 'active'"
        " AND (? IS NULL OR portal_id = ?) ORDER BY updated_at DESC, id DESC LIMIT ?",
        (portal, portal, limit),
    )
    return [ConversationItem(r["id"], r["goal"] or "", r["created_at"]) for r in rows]


# One row per kind of thing that waits for a person (D-17): the Review inbox's kinds plus a
# stopped scan. Rows with a zero count are left out.
_NEEDS: tuple[tuple[str, str, str], ...] = (
    (
        "resume_scan",
        "Stopped scans to resume",
        "SELECT count(*) FROM runs WHERE portal_id = ? AND status = 'interrupted'",
    ),
    (
        "reanchor",
        "Amendments to re-anchor",
        "SELECT count(*) FROM amendments WHERE portal_id = ? AND status = 'needs_reanchor'",
    ),
    (
        "proposals",
        "Assistant proposals to decide",
        "SELECT count(*) FROM chat_proposals WHERE portal_id = ? AND status = 'open'",
    ),
    (
        "drafts",
        "Draft doc records to confirm",
        "SELECT count(*) FROM doc_records WHERE portal_id = ? AND withdrawn = 0"
        " AND (confirmed_rev IS NULL OR confirmed_rev < latest_rev)",
    ),
)


def needs_you(conn: sqlite3.Connection, portal: str | None) -> list[NeedsRow]:
    if not portal:
        return []
    found = [NeedsRow(key, label, _count(conn, sql, (portal,))) for key, label, sql in _NEEDS]
    return [r for r in found if r.count > 0]


def processes(conn: sqlite3.Connection, portal: str | None) -> list[ProcessItem]:
    """The portal's BA processes with their as-is (spec 022 M5); on a store before migration 0018,
    the newest scope of each named process."""
    if not portal:
        return []
    try:
        ba = conn.execute(
            "SELECT p.key, p.name, p.persona, p.stage, p.updated_at, r.steps FROM ba_processes p"
            " JOIN process_models v ON v.process_id = p.id AND v.label = 'A'"
            " JOIN process_model_revisions r ON r.variant_id = v.id AND r.rev = v.rev"
            " WHERE p.portal_id = ? ORDER BY p.key",
            (portal,),
        ).fetchall()
    except sqlite3.OperationalError:
        return _scopes(conn, portal)
    items = []
    for r in ba:
        steps = json.loads(r["steps"])
        items.append(
            ProcessItem(
                r["name"],
                r["persona"],
                len(steps),
                steps[0].get("route", "") if steps else "",
                steps[-1].get("route", "") if steps else "",
                r["updated_at"],
                r["key"],
                r["stage"],
            )
        )
    # A scope saved by older code has no BA process yet: still listed.
    names = {i.name for i in items}
    return items + [s for s in _scopes(conn, portal) if s.name not in names]


def _scopes(conn: sqlite3.Connection, portal: str) -> list[ProcessItem]:
    rows = _rows(
        conn,
        "SELECT p.process_name, p.persona, p.selected_state_ids, p.created_at,"
        " s.route_template AS start_route, e.route_template AS end_route"
        " FROM process_scopes p JOIN states s ON s.id = p.start_state_id"
        " JOIN states e ON e.id = p.end_state_id"
        " WHERE p.portal_id = ? AND p.created_at = (SELECT max(q.created_at) FROM process_scopes q"
        "   WHERE q.portal_id = p.portal_id AND q.process_name = p.process_name)"
        " ORDER BY p.process_name",
        (portal,),
    )
    return [
        ProcessItem(
            r["process_name"],
            r["persona"],
            len(json.loads(r["selected_state_ids"])),
            r["start_route"],
            r["end_route"],
            r["created_at"],
        )
        for r in rows
    ]
