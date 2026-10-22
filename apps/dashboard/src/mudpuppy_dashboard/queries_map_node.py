"""Read model of one map node for the inspector (spec 033 US2, FR-010, FR-011; screen 12).

The screen's states, the scans that saw it, the moves out of it, the items it left (queued,
failed, blocked, with their reasons), and its probe outcomes; for a form step, the state the
Probe mark form posts for. Read-only.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Any

from .queries_map import MapState, ScanChoice

MAX_ITEMS = 30
# The screen and every screen the owner merged into it (a confirmed `same` verdict, FR-021).
MEMBERS = "(SELECT id FROM screens WHERE id = ? OR merged_into = ?)"


@dataclass(frozen=True)
class Move:
    label: str
    to_screen: str
    to_route: str
    to_title: str
    times: int
    failed: bool


@dataclass(frozen=True)
class LeftItem:
    status: str
    label: str
    reason: str | None


@dataclass(frozen=True)
class NodeDetail:
    screen_id: str
    route: str
    title: str
    states: list[MapState]
    scans: list[ScanChoice]
    moves: list[Move]
    items: list[LeftItem]
    outcomes: dict[str, int]  # probe outcome kind → count (happy path left out)
    mark_state: str | None  # a state of the form step, for the Probe mark form
    marked: bool
    # Spec 034 R-66: the state the other marks go on (the first main state, else the first one)
    # and the open marks on any state of this screen, kind → state id.
    target_state: str | None = None
    screen_marks: dict[str, str] | None = None


# The marks a person sets on a screen from the map (design §6), in the inspector's order.
SCREEN_MARKS = (
    ("start", "Start here", "The next focused scan starts here, by replaying the recorded path."),
    ("focus", "Focus", "Explore deeper from here in the next focused scan."),
    ("recheck", "Recheck", "A recheck scan replays to here and records what it shows now."),
    ("retry", "Retry", "A retry scan repeats the action that failed here."),
    ("skip", "Skip", "Leave this screen out of the next scans."),
)


def _screen_marks(conn: sqlite3.Connection, screen_id: str) -> dict[str, str]:
    rows = _rows(
        conn,
        "SELECT m.kind, m.state_id AS target_id FROM marks m JOIN states s ON s.id = m.state_id"
        f" WHERE m.used_by_run_id IS NULL AND m.origin = 'person' AND s.screen_id IN {MEMBERS}"
        " ORDER BY m.created_at",
        (screen_id, screen_id),
    )
    return {r["kind"]: r["target_id"] for r in rows}


def _rows(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []


def _states(conn: sqlite3.Connection, screen_id: str) -> list[MapState]:
    rows = _rows(
        conn,
        "SELECT s.id, s.state_kind, s.form_step_id, f.step_index, f.label,"
        " EXISTS (SELECT 1 FROM marks m WHERE m.kind = 'probe'"
        "   AND m.form_step_id = s.form_step_id AND m.used_by_run_id IS NULL) AS marked"
        " FROM states s LEFT JOIN form_steps f ON f.id = s.form_step_id"
        f" WHERE s.screen_id IN {MEMBERS} ORDER BY f.step_index, s.created_at, s.id",
        (screen_id, screen_id),
    )
    return [
        MapState(
            r["id"],
            r["state_kind"] or "main",
            r["step_index"],
            r["label"],
            r["form_step_id"],
            bool(r["marked"]),
        )
        for r in rows
    ]


def _moves(conn: sqlite3.Connection, screen_id: str) -> list[Move]:
    rows = _rows(
        conn,
        "SELECT coalesce(json_extract(e.action_json, '$.accessible_name'),"
        "   json_extract(e.action_json, '$.role'), '') AS label,"
        " t.screen_id AS to_screen, sc.route_template AS to_route, sc.title AS to_title,"
        " count(*) AS times, max(e.error IS NOT NULL) AS failed"
        " FROM transitions e JOIN states f ON f.id = e.from_state"
        " JOIN states t ON t.id = e.to_state"
        " JOIN screens sc ON sc.id = t.screen_id"
        f" WHERE f.screen_id IN {MEMBERS} AND e.status = 'executed'"
        f" AND t.screen_id NOT IN {MEMBERS}"
        " GROUP BY label, t.screen_id ORDER BY sc.route_template, label",
        (screen_id, screen_id, screen_id, screen_id),
    )
    return [
        Move(
            r["label"], r["to_screen"], r["to_route"], r["to_title"], r["times"], bool(r["failed"])
        )
        for r in rows
    ]


def _items(conn: sqlite3.Connection, screen_id: str) -> list[LeftItem]:
    """Items left on the page: not done in any scan (a later scan may have done them)."""
    rows = _rows(
        conn,
        "SELECT DISTINCT fr.status, coalesce(json_extract(fr.action_json, '$.accessible_name'),"
        "   json_extract(fr.action_json, '$.url'), '') AS label, fr.reason"
        " FROM frontier fr JOIN states s ON s.id = fr.state_id"
        f" WHERE s.screen_id IN {MEMBERS} AND fr.status <> 'done'"
        " AND NOT EXISTS (SELECT 1 FROM frontier d JOIN states ds ON ds.id = d.state_id"
        "   WHERE ds.screen_id = s.screen_id AND d.status = 'done'"
        "   AND d.action_json ->> '$.accessible_name' IS fr.action_json ->> '$.accessible_name'"
        "   AND d.action_json ->> '$.role' IS fr.action_json ->> '$.role')"
        " ORDER BY fr.status, label LIMIT ?",
        (screen_id, screen_id, MAX_ITEMS),
    )
    return [LeftItem(r["status"], r["label"], r["reason"]) for r in rows]


def node_detail(conn: sqlite3.Connection, portal: str, screen_id: str) -> NodeDetail | None:
    """None when the screen is not the portal's."""
    head = _rows(
        conn,
        "SELECT id, route_template, title FROM screens WHERE id = ? AND portal_id = ?",
        (screen_id, portal),
    )
    if not head:
        return None
    states = _states(conn, screen_id)
    scans = _rows(
        conn,
        "SELECT DISTINCT r.id, r.persona_id, r.status, r.started_at FROM state_observations o"
        " JOIN states s ON s.id = o.state_id JOIN runs r ON r.id = o.run_id"
        f" WHERE s.screen_id IN {MEMBERS} ORDER BY r.started_at DESC",
        (screen_id, screen_id),
    )
    outcomes = _rows(
        conn,
        "SELECT o.outcome_kind, count(*) AS n FROM probe_outcomes o"
        " JOIN states s ON s.id = o.from_state_id"
        f" WHERE s.screen_id IN {MEMBERS} AND o.probe_id <> 'happy-path' GROUP BY o.outcome_kind",
        (screen_id, screen_id),
    )
    step = next((s for s in states if s.form_step_id), None)
    main = next((s for s in states if s.kind == "main"), states[0] if states else None)
    return NodeDetail(
        target_state=main.id if main else None,
        screen_marks=_screen_marks(conn, screen_id),
        screen_id=screen_id,
        route=head[0]["route_template"],
        title=head[0]["title"],
        states=states,
        scans=[ScanChoice(r["id"], r["persona_id"], r["status"], r["started_at"]) for r in scans],
        moves=_moves(conn, screen_id),
        items=_items(conn, screen_id),
        outcomes={r["outcome_kind"]: r["n"] for r in outcomes},
        mark_state=step.id if step else None,
        marked=bool(step and step.marked),
    )
