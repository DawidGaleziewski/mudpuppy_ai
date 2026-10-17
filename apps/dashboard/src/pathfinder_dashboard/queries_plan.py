"""Read models for the next scan plan and a stopped scan's recovery (spec 034 R-66; design
11-map-runs §4–§6, screens 14 and 15). Read-only: the scan itself starts through the chat service.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field

MARK_LABELS = {
    "start": "Start here",
    "focus": "Focus",
    "recheck": "Recheck",
    "retry": "Retry",
    "skip": "Skip",
    "probe": "Probe",
}


@dataclass(frozen=True)
class MarkRow:
    id: str
    kind: str
    target_kind: str
    target_id: str
    title: str
    route: str
    by: str
    at: str
    # How a scan would reach the marked screen: "opens by its URL", "replays N steps", or None.
    reach: str | None


@dataclass(frozen=True)
class Plan:
    marks: dict[str, list[MarkRow]]
    personas: list[str]
    environments: list[str]

    @property
    def total(self) -> int:
        return sum(len(v) for v in self.marks.values())


def _reach(conn: sqlite3.Connection, state_id: str) -> str | None:
    """How a replay would reach a state: a recorded direct visit, else the shortest checkpoint."""
    direct = conn.execute(
        "SELECT 1 FROM page_visits WHERE state_id = ? AND via = 'navigate' LIMIT 1", (state_id,)
    ).fetchone()
    if direct:
        return "opens by its URL"
    try:
        row = conn.execute(
            "SELECT min(json_array_length(steps_json)) FROM checkpoints WHERE state_id = ?",
            (state_id,),
        ).fetchone()
    except sqlite3.OperationalError:  # a store from before migration 0027
        row = None
    if row and row[0] is not None:
        n = int(row[0])
        return "opens by its URL" if n == 0 else f"replays {n} step{'s' if n != 1 else ''}"
    visited = conn.execute(
        "SELECT 1 FROM page_visits WHERE state_id = ? LIMIT 1", (state_id,)
    ).fetchone()
    return "replays the recorded visit" if visited else None


def _target(conn: sqlite3.Connection, kind: str, target_id: str) -> tuple[str, str, str | None]:
    """Title, route and the state a replay goes to, for a state, an edge or a form step."""
    if kind == "state":
        r = conn.execute(
            "SELECT title, route_template FROM states WHERE id = ?", (target_id,)
        ).fetchone()
        return (r[0], r[1], target_id) if r else ("(gone)", "-", None)
    if kind == "edge":
        r = conn.execute(
            "SELECT e.action_json, s.title, s.route_template, e.from_state FROM edges e"
            " JOIN states s ON s.id = e.from_state WHERE e.id = ?",
            (target_id,),
        ).fetchone()
        if not r:
            return ("(gone)", "-", None)
        name = json.loads(r[0]).get("accessible_name") or json.loads(r[0]).get("role") or "action"
        return (f"“{name}” on {r[1]}", r[2], r[3])
    r = conn.execute(
        "SELECT label, route_template FROM form_steps WHERE id = ?", (target_id,)
    ).fetchone()
    return (r[0], r[1], None) if r else ("(gone)", "-", None)


def open_mark_count(conn: sqlite3.Connection, portal: str) -> int:
    """The Next scan plan tray's count on the map (design §6)."""
    try:
        row = conn.execute(
            "SELECT count(*) FROM marks WHERE portal_id = ? AND used_by_run_id IS NULL",
            (portal,),
        ).fetchone()
    except sqlite3.OperationalError:
        return 0
    return int(row[0])


def plan(conn: sqlite3.Connection, portal: str) -> Plan:
    rows = conn.execute(
        "SELECT id, kind, target_kind, target_id, created_by, created_at FROM marks"
        " WHERE portal_id = ? AND used_by_run_id IS NULL ORDER BY created_at",
        (portal,),
    ).fetchall()
    marks: dict[str, list[MarkRow]] = {}
    for r in rows:
        title, route, state = _target(conn, r["target_kind"], r["target_id"])
        reach = _reach(conn, state) if state else None
        marks.setdefault(r["kind"], []).append(
            MarkRow(
                r["id"],
                r["kind"],
                r["target_kind"],
                r["target_id"],
                title,
                route,
                r["created_by"],
                r["created_at"],
                reach,
            )
        )
    personas = [
        p[0]
        for p in conn.execute(
            "SELECT DISTINCT persona_id FROM runs WHERE portal_id = ? ORDER BY 1", (portal,)
        )
    ]
    envs = [
        e[0]
        for e in conn.execute(
            "SELECT DISTINCT environment FROM runs WHERE portal_id = ? ORDER BY 1", (portal,)
        )
    ]
    return Plan(marks, personas, envs)


# How a retry may vary the failed action (screen 15); the recovery page and the run graph offer it.
VARIATIONS = (
    ("none", "As before"),
    ("wait_longer", "Wait longer"),
    ("other_input", "Other input"),
    ("no_submit", "Don't submit"),
)


@dataclass(frozen=True)
class FailedAction:
    edge_id: str
    label: str
    route: str
    error: str
    at: str


@dataclass(frozen=True)
class Attempt:
    run_id: str
    run_type: str
    status: str
    started_at: str
    variation: str
    # A retry passed when it executed the target action without an error; None for other types.
    passed: bool | None


@dataclass(frozen=True)
class Recovery:
    run_id: str
    portal: str
    persona: str
    environment: str
    status: str
    warning: str | None
    steps: int
    last_state: tuple[str, str, str] | None  # id, title, route of the last good screen
    failed: list[FailedAction]
    pending: int
    attempts: list[Attempt] = field(default_factory=list)

    @property
    def failure_class(self) -> str:
        """Design §4: what failed decides the default (crawler error, portal error, blocked)."""
        text = " ".join([self.warning or "", *(f.error for f in self.failed)]).lower()
        if any(w in text for w in ("captcha", "blocked", "credential", "login")):
            return "blocked"
        if any(w in text for w in ("http 5", "error page", "503", "500")):
            return "portal error"
        return "crawler error"


def error_text(raw: str | None) -> str:
    """An edge's stored error as one line (its message, else its code)."""
    if not raw:
        return ""
    try:
        e = json.loads(raw)
    except ValueError:
        return raw
    if isinstance(e, dict):
        return str(e.get("message") or e.get("code") or raw)
    return str(e)


def _attempt_passed(conn: sqlite3.Connection, run_id: str, plan_json: str | None) -> bool | None:
    try:
        plan_obj = json.loads(plan_json or "null")
    except ValueError:
        return None
    if not isinstance(plan_obj, dict) or plan_obj.get("type") != "retry":
        return None
    target = plan_obj.get("target_edge_id")
    t = conn.execute("SELECT from_state, action_json FROM edges WHERE id = ?", (target,)).fetchone()
    if not t:
        return None
    name = json.loads(t[1]).get("accessible_name")
    rows = conn.execute(
        "SELECT action_json, error FROM edges WHERE run_id = ? AND from_state = ?"
        " AND status = 'executed'",
        (run_id, t[0]),
    ).fetchall()
    same = [r for r in rows if json.loads(r[0]).get("accessible_name") == name]
    return any(r[1] is None for r in same) if same else False


def recovery(conn: sqlite3.Connection, run_id: str) -> Recovery | None:
    run = conn.execute(
        "SELECT id, portal_id, persona_id, environment, status, warning, steps_used FROM runs"
        " WHERE id = ?",
        (run_id,),
    ).fetchone()
    if not run:
        return None
    last = conn.execute(
        "SELECT s.id, s.title, s.route_template FROM state_observations o"
        " JOIN states s ON s.id = o.state_id WHERE o.run_id = ? AND s.state_kind <> 'technical'"
        " ORDER BY o.observed_at DESC LIMIT 1",
        (run_id,),
    ).fetchone()
    failed = [
        FailedAction(
            r["id"],
            json.loads(r["action_json"]).get("accessible_name")
            or json.loads(r["action_json"]).get("role")
            or "action",
            r["route_template"],
            error_text(r["error"]),
            r["created_at"],
        )
        for r in conn.execute(
            "SELECT e.id, e.action_json, e.error, e.created_at, s.route_template FROM edges e"
            " JOIN states s ON s.id = e.from_state WHERE e.run_id = ? AND e.error IS NOT NULL"
            # Skip checks its action against this list; the run graph offers it on every failure
            " ORDER BY e.created_at DESC LIMIT 500",
            (run_id,),
        )
    ]
    pending = conn.execute(
        "SELECT count(*) FROM frontier WHERE run_id = ? AND status = 'pending'", (run_id,)
    ).fetchone()[0]
    attempts = []
    try:
        children = conn.execute(
            "SELECT id, run_type, status, started_at, plan_json FROM runs WHERE parent_run_id = ?"
            " ORDER BY started_at",
            (run_id,),
        ).fetchall()
    except sqlite3.OperationalError:  # a store from before migration 0027: no linked runs yet
        children = []
    for a in children:
        try:
            variation = json.loads(a["plan_json"] or "{}").get("variation", "none")
        except ValueError:
            variation = "none"
        attempts.append(
            Attempt(
                a["id"],
                a["run_type"] or "scan",
                a["status"],
                a["started_at"],
                variation,
                _attempt_passed(conn, a["id"], a["plan_json"]),
            )
        )
    return Recovery(
        run["id"],
        run["portal_id"],
        run["persona_id"],
        run["environment"],
        run["status"],
        run["warning"],
        run["steps_used"],
        (last["id"], last["title"], last["route_template"]) if last else None,
        failed,
        int(pending),
        attempts,
    )
