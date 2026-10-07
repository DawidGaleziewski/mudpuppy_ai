"""Read models for the Chat page and the step tracker (spec 010, R-30; US1, US2, FR-019).

The chat service is the only writer of these tables; the dashboard reads them read-only. A store
made before migration 0008 has no chat tables: every function then answers "nothing there".
"""

from __future__ import annotations

import contextlib
import json
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

from .models import Amendment, ChatConversation, ChatMessage, State, WorkflowStep
from .visuals import load_layout

STEPS: tuple[tuple[str, str], ...] = (
    ("scan", "Scan"),
    ("map", "Map"),
    ("narrow", "Narrow"),
    ("document", "Document"),
    ("amend", "Amend"),
)
# Statuses that mean "work is under way": the tracker keeps polling and the animation shows.
ACTIVE_STATUSES = ("pending", "in_progress")


@dataclass(frozen=True)
class TrackerRow:
    step: str
    label: str
    status: str  # todo | pending | in_progress | done | failed | stopped
    error_ref: str | None
    run_id: str | None
    run_running: bool = False  # the linked run is still running: the tracker offers "Stop scan"


@dataclass(frozen=True)
class Tracker:
    portal_id: str | None
    rows: list[TrackerRow]

    @property
    def active(self) -> bool:
        return any(r.status in ACTIVE_STATUSES for r in self.rows)


def get_conversation(conn: sqlite3.Connection, conversation_id: str) -> ChatConversation | None:
    try:
        row = conn.execute(
            "SELECT * FROM chat_conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
    except sqlite3.OperationalError:
        return None
    return ChatConversation.model_validate(dict(row)) if row else None


def newest_active_conversation(
    conn: sqlite3.Connection, portal: str | None = None
) -> ChatConversation | None:
    """With a portal (the header's choice, spec 011): its newest conversation, counting one whose
    own portal is unset but whose steps are on that portal."""
    where, args = "status = 'active'", ()
    if portal:
        where += (
            " AND (portal_id = ? OR (portal_id IS NULL AND id IN"
            " (SELECT conversation_id FROM workflow_steps WHERE portal_id = ?)))"
        )
        args = (portal, portal)
    try:
        row = conn.execute(
            f"SELECT * FROM chat_conversations WHERE {where}"
            " ORDER BY created_at DESC, id DESC LIMIT 1",
            args,
        ).fetchone()
    except sqlite3.OperationalError:
        return None
    return ChatConversation.model_validate(dict(row)) if row else None


def list_messages(conn: sqlite3.Connection, conversation_id: str) -> list[ChatMessage]:
    """The conversation's history in send order. Tool rows are bookkeeping, not conversation."""
    try:
        rows = conn.execute(
            "SELECT * FROM chat_messages WHERE conversation_id = ? AND role <> 'tool' ORDER BY seq",
            (conversation_id,),
        ).fetchall()
    except sqlite3.OperationalError:
        return []
    return [ChatMessage.model_validate(dict(r)) for r in rows]


def tracker(conn: sqlite3.Connection, conversation: ChatConversation) -> Tracker:
    """Five rows, one per step. A step with no row yet is "todo". With several portals in one
    conversation, the conversation's own portal wins, else the portal of the newest row."""
    try:
        rows = conn.execute(
            "SELECT * FROM workflow_steps WHERE conversation_id = ?"
            " ORDER BY updated_at DESC, id DESC",
            (conversation.id,),
        ).fetchall()
    except sqlite3.OperationalError:
        rows = []
    steps = [WorkflowStep.model_validate(dict(r)) for r in rows]
    portal = conversation.portal_id or (steps[0].portal_id if steps else None)
    newest: dict[str, WorkflowStep] = {}
    for s in steps:  # newest first, so the first one seen per step is the current one
        if s.portal_id == portal and s.step not in newest:
            newest[s.step] = s
    linked = [s.run_id for s in newest.values() if s.run_id]
    marks = ",".join("?" * len(linked))
    running = (
        {
            r["id"]
            for r in conn.execute(
                f"SELECT id FROM runs WHERE status = 'running' AND id IN ({marks})", linked
            )
        }
        if linked
        else set()
    )
    out = []
    for key, label in STEPS:
        found = newest.get(key)
        out.append(
            TrackerRow(
                key,
                label,
                found.status if found else "todo",
                found.error_ref if found else None,
                found.run_id if found else None,
                bool(found and found.run_id in running),
            )
        )
    return Tracker(portal, out)


# --- portals for the header dropdown (spec 011 FR-001) -----------------------------------------


def known_portals(conn: sqlite3.Connection | None, portals_dir: Path) -> list[str]:
    """Configured portals (`<id>/portal.yaml`) and portals with runs in this store, sorted."""
    found: set[str] = set()
    if portals_dir.is_dir():
        found |= {p.name for p in portals_dir.iterdir() if (p / "portal.yaml").is_file()}
    if conn is not None:
        with contextlib.suppress(sqlite3.OperationalError):  # a store without runs yet
            found |= {r[0] for r in conn.execute("SELECT DISTINCT portal_id FROM runs")}
    return sorted(found)


# --- progress of the conversation's run: counters and activity feed (T047, F-22) ---------------


@dataclass(frozen=True)
class ActivityItem:
    at: str
    kind: str  # page | step | form | problem | skipped | question
    text: str
    state_id: str | None


@dataclass(frozen=True)
class Progress:
    run_id: str
    portal_id: str
    mode: str
    status: str
    started_at: str
    ended_at: str | None
    pages: int  # states observed in this run
    queued: int  # frontier items still pending
    steps_used: int
    max_steps: int | None
    last_activity: str | None
    items: list[ActivityItem]

    @property
    def running(self) -> bool:
        return self.status == "running"

    def elapsed_ms(self, now: datetime) -> int:
        """Until now while running; else until the last recorded activity, because a run left
        "running" is only marked interrupted much later (F-22: 10 min of work showed as 8 h)."""
        if self.running:
            end = now
        else:
            end = _parse(self.last_activity or self.ended_at or self.started_at)
        return max(0, int((end - _parse(self.started_at)).total_seconds() * 1000))

    def quiet_ms(self, now: datetime) -> int | None:
        """Time since the last recorded activity of a running run; None when it is not running."""
        if not self.running:
            return None
        last = _parse(self.last_activity or self.started_at)
        return max(0, int((now - last).total_seconds() * 1000))


def _parse(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def _name(action_json: str) -> str:
    """`link "Kontakt"` from an action's JSON; the role alone when it has no name."""
    try:
        action = json.loads(action_json)
    except ValueError:
        return "an element"
    role = str(action.get("role") or "element")
    name = action.get("accessible_name")
    return f'{role} "{name}"' if name else role


# One row per recorded fact of the run, newest first. Text is built in Python from these columns.
# Steps name pages by route: several states can share one title (e.g. "Logowanie | …").
_FEED_SQL = """
SELECT so.observed_at AS at, 'page' AS kind, so.state_id AS state_id,
       s.title AS a, s.route_template AS b, NULL AS c
  FROM state_observations so JOIN states s ON s.id = so.state_id WHERE so.run_id = :run
UNION ALL
SELECT e.created_at, CASE WHEN e.error IS NOT NULL OR e.stabilization = 'never_stabilized'
                          THEN 'problem' ELSE 'step' END,
       e.to_state, s1.route_template, s2.route_template,
       json_object('action', e.action_json, 'error', e.error, 'stab', e.stabilization)
  FROM edges e JOIN states s1 ON s1.id = e.from_state LEFT JOIN states s2 ON s2.id = e.to_state
 WHERE e.run_id = :run AND e.status = 'executed'
UNION ALL
SELECT f.created_at, 'form', f.state_id, s.title, NULL, NULL
  FROM forms f JOIN states s ON s.id = f.state_id WHERE f.run_id = :run
UNION ALL
SELECT n.created_at, 'problem', NULL, n.method, n.url_template, CAST(n.status AS TEXT)
  FROM network_calls n WHERE n.run_id = :run AND n.status >= 400
UNION ALL
SELECT fr.updated_at, 'skipped', fr.state_id, fr.action_json, fr.status, fr.reason
  FROM frontier fr WHERE fr.run_id = :run AND fr.status NOT IN ('pending', 'done')
UNION ALL
SELECT q.created_at, 'question', NULL, q.text, NULL, NULL
  FROM open_questions q WHERE q.run_id = :run
ORDER BY at DESC LIMIT :limit
"""


def _feed_text(kind: str, a: Any, b: Any, c: Any) -> str:
    if kind == "page":
        return f"New page: {a} ({b})"
    if kind == "form":
        return f"Form found on {a}"
    if kind == "question":
        return f"Question for you: {a}"
    if kind == "skipped":
        return f"Not done: {_name(a)} ({str(b).replace('_', ' ')}: {c})"
    if kind == "problem" and c is not None and c.isdigit():
        return f"HTTP {c} on {a} {b}"
    # an executed step; `c` holds the action, error and stabilisation
    data = json.loads(c)
    target = f" → {b}" if b else " (no new page)"
    text = f"Clicked {_name(data['action'])} on {a}{target}"
    if data.get("error"):
        try:
            message = json.loads(data["error"]).get("message") or data["error"]
        except (ValueError, AttributeError):
            message = data["error"]
        return f"{text}. Error: {message}"
    if data.get("stab") == "never_stabilized":
        return f"{text}. The page never settled."
    return text


def progress(conn: sqlite3.Connection, tracker: Tracker, limit: int = 30) -> Progress | None:
    """The run the conversation's steps follow (a running one first, else the newest), with
    counters and the latest activity. None when no step is linked to a run yet."""
    linked = [r.run_id for r in tracker.rows if r.run_id]
    if not linked:
        return None
    marks = ",".join("?" * len(linked))
    try:
        run = conn.execute(
            f"SELECT * FROM runs WHERE id IN ({marks})"
            " ORDER BY status = 'running' DESC, started_at DESC LIMIT 1",
            linked,
        ).fetchone()
        if run is None:
            return None
        rid = run["id"]
        pages = conn.execute(
            "SELECT count(*) FROM state_observations WHERE run_id = ?", (rid,)
        ).fetchone()[0]
        queued = conn.execute(
            "SELECT count(*) FROM frontier WHERE run_id = ? AND status = 'pending'", (rid,)
        ).fetchone()[0]
        rows = conn.execute(_FEED_SQL, {"run": rid, "limit": limit}).fetchall()
    except sqlite3.OperationalError:
        return None
    try:
        max_steps = json.loads(run["config_snapshot"])["portal"]["scope"]["max_steps"]
    except (ValueError, KeyError, TypeError):
        max_steps = None
    items = [
        ActivityItem(
            r["at"], r["kind"], _feed_text(r["kind"], r["a"], r["b"], r["c"]), r["state_id"]
        )
        for r in rows
    ]
    return Progress(
        run_id=rid,
        portal_id=run["portal_id"],
        mode=run["mode"],
        status=run["status"],
        started_at=run["started_at"],
        ended_at=run["ended_at"],
        pages=pages,
        queued=queued,
        steps_used=run["steps_used"],
        max_steps=max_steps if isinstance(max_steps, int) else None,
        last_activity=items[0].at if items else None,
        items=items,
    )


# --- credentials form: which `ref:NAME`s a portal's personas need (T020) -----------------------

REF_NAME = re.compile(r"^[A-Z][A-Z0-9_]{0,63}$")
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
# Environments the vault knows (research R5); the form offers exactly these.
ENVIRONMENTS = ("sandbox", "staging", "production")


@dataclass(frozen=True)
class PersonaInfo:
    id: str
    refs: list[str]  # credential reference names, in file order, no duplicates


def _collect_refs(node: Any, out: list[str]) -> None:
    if isinstance(node, str):
        if node.startswith("ref:") and REF_NAME.match(node[4:]) and node[4:] not in out:
            out.append(node[4:])
    elif isinstance(node, dict):
        for value in node.values():
            _collect_refs(value, out)
    elif isinstance(node, list):
        for value in node:
            _collect_refs(value, out)


def _load_yaml(path: Path) -> Any:
    try:
        return yaml.safe_load(path.read_text("utf-8"))
    except (OSError, yaml.YAMLError, UnicodeDecodeError):
        return None


def list_personas(personas_dir: Path, portal: str | None) -> list[PersonaInfo]:
    """Top-level `personas/<portal>/*.yaml` (the files the scope check accepts), each with the
    `ref:NAME` values in it and in the mixins it extends (only inside `personas/`). A missing
    folder or an unreadable file gives fewer entries, never an error."""
    if not portal or not _SAFE_ID.match(portal):
        return []
    folder = personas_dir / portal
    if not folder.is_dir():
        return []
    root = personas_dir.resolve()
    out = []
    for path in sorted(folder.glob("*.yaml")):
        doc = _load_yaml(path)
        refs: list[str] = []
        _collect_refs(doc, refs)
        extends = doc.get("extends") if isinstance(doc, dict) else None
        for rel in extends if isinstance(extends, list) else []:
            if not isinstance(rel, str):
                continue
            target = (path.parent / rel).resolve()
            if target.is_relative_to(root) and target.is_file():
                _collect_refs(_load_yaml(target), refs)
        out.append(PersonaInfo(path.stem, refs))
    return out


# --- scope checklist (T027) --------------------------------------------------------------------


def portal_states(conn: sqlite3.Connection, portal: str | None) -> list[State]:
    """The portal's mapped states, in route order, for the checklist and the re-apply picker."""
    if not portal:
        return []
    rows = conn.execute(
        "SELECT * FROM states WHERE portal_id = ? ORDER BY route_template, title, id", (portal,)
    ).fetchall()
    return [State.model_validate(dict(r)) for r in rows]


# --- amendments (T031, T033); the chat service is the only writer -------------------------------

SUPERSEDED_REASONS = {
    "state_replaced": "state replaced by a newer recording",
    "element_changed": "element changed",
    "element_removed": "element removed",
}
SHOW_FILTERS = ("superseded", "dismissed", "both")


def _amendments(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[Amendment]:
    try:
        rows = conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:  # a store made before migration 0008
        return []
    return [Amendment.model_validate(dict(r)) for r in rows]


def amendments_for_state(conn: sqlite3.Connection, portal: str, state_id: str) -> list[Amendment]:
    """Amendments on a state or on one of its wireframe elements (`<state id>#<element key>`),
    by ranges on the existing (portal, target_kind, target_id) index."""
    return _amendments(
        conn,
        "SELECT * FROM amendments WHERE portal_id = ? AND ("
        " (target_kind = 'state' AND target_id = ?)"
        " OR (target_kind = 'wireframe_element' AND target_id >= ? AND target_id < ?))"
        " ORDER BY key",
        (portal, state_id, state_id + "#", state_id + "$"),  # "$" is "#" + 1
    )


def state_elements(data_dir: Path, state: State) -> list[tuple[str, str]]:
    """(key, readable label) of every element the state's stored layout placed."""
    layout = load_layout(data_dir, state.layout_ref)
    if layout is None:
        return []
    return [(e.key, f'{e.role} "{e.name}"' if e.name else e.role) for e in layout.elements]


def superseded_amendments(
    conn: sqlite3.Connection, portal: str | None, show: str
) -> list[Amendment]:
    statuses = {"superseded": ("superseded",), "dismissed": ("dismissed",)}.get(
        show, ("superseded", "dismissed")
    )
    marks = ", ".join("?" for _ in statuses)
    sql = f"SELECT * FROM amendments WHERE status IN ({marks})"
    args: tuple[Any, ...] = statuses
    if portal:
        sql += " AND portal_id = ?"
        args = (*args, portal)
    sql += " ORDER BY COALESCE(superseded_at, dismissed_at) DESC, key LIMIT 200"
    return _amendments(conn, sql, args)


def superseded_counts(conn: sqlite3.Connection) -> dict[str, int]:
    """Superseded amendments per portal that still wait for a decision (a re-applied one does not;
    a dismissed one has another status)."""
    try:
        rows = conn.execute(
            "SELECT portal_id, COUNT(*) AS n FROM amendments"
            " WHERE status = 'superseded' AND reapplied_as IS NULL GROUP BY portal_id"
        ).fetchall()
    except sqlite3.OperationalError:
        return {}
    return {r["portal_id"]: r["n"] for r in rows}


def amendment_portals(conn: sqlite3.Connection) -> list[str]:
    try:
        rows = conn.execute("SELECT DISTINCT portal_id FROM amendments ORDER BY portal_id")
    except sqlite3.OperationalError:
        return []
    return [r["portal_id"] for r in rows]


def element_key(amendment: Amendment) -> str | None:
    """The element key an amendment was anchored to, when it targeted a wireframe element."""
    anchor = amendment.anchor_element
    key = anchor.get("key") if isinstance(anchor, dict) else None
    return key if isinstance(key, str) else None


def target_state_id(amendment: Amendment) -> str | None:
    """The state a state or element amendment points at (evidence targets have none)."""
    if amendment.target_kind == "state":
        return amendment.target_id
    if amendment.target_kind == "wireframe_element":
        return amendment.target_id.split("#", 1)[0]
    return None
