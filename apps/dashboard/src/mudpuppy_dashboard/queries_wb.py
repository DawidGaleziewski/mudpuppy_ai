"""Workbench read models (spec 043 T030): a Workbench conversation as turns (the person's message
or an event, the assistant's words, the turn's view and command cards), its path and who chose
it, the viewer's feedback, the records a card shows. The chat service writes every row; this
module only reads (D-2)."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from typing import Any

from .queries_changes import rows_of

EVENT = "workbench_event"  # chat_messages.tool_name of an event turn (apps/chat service.ts)


@dataclass(frozen=True)
class WbConversation:
    id: str
    portal: str
    path: str
    path_source: str  # assistant · you
    title: str | None
    created_at: str


@dataclass(frozen=True)
class WbView:
    id: str
    turn: int
    path: str
    why: str
    spec: dict[str, Any]
    fallback: bool
    created_at: str


@dataclass(frozen=True)
class WbCommand:
    id: str
    turn: int
    command: str
    args: dict[str, Any]
    reason: str
    source: str
    state: str
    result: dict[str, Any]
    error_ref: str | None
    confirmed_by: str | None
    created_at: str


@dataclass
class WbTurn:
    n: int
    asked: str  # what the person typed, or the event line
    is_event: bool
    answer: list[str] = field(default_factory=list)
    notices: list[str] = field(default_factory=list)
    view: WbView | None = None
    commands: list[WbCommand] = field(default_factory=list)


CONVERSATION_SQL = (
    "SELECT c.id, c.portal_id, c.created_at, COALESCE(w.path, 'chat') AS path,"
    " COALESCE(w.path_source, 'assistant') AS path_source, w.title"
    " FROM chat_conversations c LEFT JOIN workbench_conversations w ON w.conversation_id = c.id"
    " WHERE c.id = ? AND c.kind = 'workbench'"
)


def conversation(conn: sqlite3.Connection, conversation_id: str) -> WbConversation | None:
    rows = rows_of(conn, CONVERSATION_SQL, (conversation_id,))
    if not rows or rows[0]["portal_id"] is None:
        return None
    r = rows[0]
    return WbConversation(
        r["id"], r["portal_id"], r["path"], r["path_source"], r["title"], r["created_at"]
    )


RECENT_SQL = (
    "SELECT c.id, c.portal_id, c.created_at, COALESCE(w.path, 'chat') AS path,"
    " COALESCE(w.path_source, 'assistant') AS path_source, w.title,"
    " (SELECT content FROM chat_messages m WHERE m.conversation_id = c.id AND m.role = 'user'"
    "  ORDER BY m.seq LIMIT 1) AS first"
    " FROM chat_conversations c LEFT JOIN workbench_conversations w ON w.conversation_id = c.id"
    " WHERE c.kind = 'workbench' AND c.portal_id = ? ORDER BY c.created_at DESC LIMIT 20"
)


def recent(conn: sqlite3.Connection, portal: str) -> list[tuple[WbConversation, str]]:
    """The portal's last 20 Workbench conversations (WB-UI-42), each with its first message."""
    return [
        (
            WbConversation(
                r["id"], r["portal_id"], r["path"], r["path_source"], r["title"], r["created_at"]
            ),
            r["first"] or "",
        )
        for r in rows_of(conn, RECENT_SQL, (portal,))
    ]


def _view_of(r: sqlite3.Row) -> WbView:
    return WbView(
        r["id"],
        r["turn"],
        r["path"],
        r["why"],
        json.loads(r["spec_json"]),
        bool(r["fallback"]),
        r["created_at"],
    )


VIEWS_SQL = (
    "SELECT id, turn, path, why, spec_json, fallback, created_at FROM workbench_views"
    " WHERE conversation_id = ? ORDER BY turn"
)
VIEW_SQL = (
    "SELECT id, turn, path, why, spec_json, fallback, created_at FROM workbench_views WHERE id = ?"
)


def views(conn: sqlite3.Connection, conversation_id: str) -> dict[int, WbView]:
    return {v.turn: v for v in map(_view_of, rows_of(conn, VIEWS_SQL, (conversation_id,)))}


def view(conn: sqlite3.Connection, view_id: str) -> WbView | None:
    rows = rows_of(conn, VIEW_SQL, (view_id,))
    return _view_of(rows[0]) if rows else None


def _command_of(r: sqlite3.Row) -> WbCommand:
    return WbCommand(
        r["id"],
        r["turn"],
        r["command"],
        json.loads(r["args_json"]),
        r["reason"],
        r["source"],
        r["state"],
        json.loads(r["result_json"]) if r["result_json"] else {},
        r["error_ref"],
        r["confirmed_by"],
        r["created_at"],
    )


COMMANDS_SQL = "SELECT * FROM workbench_commands WHERE conversation_id = ? ORDER BY created_at"
COMMAND_SQL = "SELECT * FROM workbench_commands WHERE id = ?"


def commands(conn: sqlite3.Connection, conversation_id: str) -> list[WbCommand]:
    return [_command_of(r) for r in rows_of(conn, COMMANDS_SQL, (conversation_id,))]


def command(conn: sqlite3.Connection, command_id: str) -> WbCommand | None:
    rows = rows_of(conn, COMMAND_SQL, (command_id,))
    return _command_of(rows[0]) if rows else None


def conversation_of_command(conn: sqlite3.Connection, command_id: str) -> str | None:
    row = conn.execute(
        "SELECT conversation_id FROM workbench_commands WHERE id = ?", (command_id,)
    ).fetchone()
    return row[0] if row else None


MESSAGES_SQL = (
    "SELECT seq, role, content, tool_name FROM chat_messages WHERE conversation_id = ? ORDER BY seq"
)


def turns(conn: sqlite3.Connection, conversation_id: str) -> list[WbTurn]:
    """Messages grouped by turn: a turn starts at the person's message or an event."""
    out: list[WbTurn] = []
    for m in rows_of(conn, MESSAGES_SQL, (conversation_id,)):
        if m["role"] == "user" or m["tool_name"] == EVENT:
            out.append(WbTurn(len(out) + 1, m["content"], m["tool_name"] == EVENT))
        elif out and m["role"] == "assistant":
            out[-1].answer.append(m["content"])
        elif out and m["role"] == "system":
            out[-1].notices.append(m["content"])
    by_turn = views(conn, conversation_id)
    for t in out:
        t.view = by_turn.get(t.n)
    for cmd in commands(conn, conversation_id):
        if 0 < cmd.turn <= len(out):
            out[cmd.turn - 1].commands.append(cmd)
    return out


def current_turn(conn: sqlite3.Connection, conversation_id: str) -> int:
    row = conn.execute(
        "SELECT count(*) FROM chat_messages WHERE conversation_id = ?"
        " AND (role = 'user' OR tool_name = ?)",
        (conversation_id, EVENT),
    ).fetchone()
    return max(1, row[0])


FEEDBACK_SQL = "SELECT value, reasons_json FROM workbench_feedback WHERE view_id = ? AND by = ?"


def feedback(conn: sqlite3.Connection, view_id: str, by: str | None) -> tuple[str | None, tuple]:
    """The viewer's answer to "Right view?" and the reasons they picked."""
    rows = rows_of(conn, FEEDBACK_SQL, (view_id, by or ""))
    if not rows:
        return None, ()
    return rows[0]["value"], tuple(json.loads(rows[0]["reasons_json"]))


@dataclass(frozen=True)
class RecordRow:
    key: str
    title: str
    kind: str
    confirmed: bool


RECORDS_SQL = (
    "SELECT key, title, kind, confirmed_rev FROM doc_records WHERE portal_id = ? AND key IN ({})"
    " AND withdrawn = 0"
)


def records(conn: sqlite3.Connection, portal: str, keys: list[str]) -> dict[str, RecordRow]:
    if not keys:
        return {}
    sql = RECORDS_SQL.format(", ".join("?" for _ in keys))
    return {
        r["key"]: RecordRow(r["key"], r["title"], r["kind"], r["confirmed_rev"] is not None)
        for r in rows_of(conn, sql, (portal, *keys))
    }


def bound_scans(conn: sqlite3.Connection, conversation_id: str) -> list[str]:
    """Run ids the conversation binds: scans in its views and runs its commands started."""
    shorts: list[str] = []
    for v in views(conn, conversation_id).values():
        for c in v.spec.get("components", []):
            scan = c.get("bind", {}).get("scan")
            if isinstance(scan, str):
                shorts.append(scan)
    started = [
        c.result.get("run_id")
        for c in commands(conn, conversation_id)
        if isinstance(c.result.get("run_id"), str)
    ]
    return list(dict.fromkeys([*shorts, *[r[:8] for r in started]]))


def newest_persona(conn: sqlite3.Connection, portal: str) -> str | None:
    """The persona of the portal's newest scan: a Start card's default (spec 044 FR-002)."""
    row = conn.execute(
        "SELECT persona_id FROM runs WHERE portal_id = ? ORDER BY started_at DESC LIMIT 1",
        (portal,),
    ).fetchone()
    return str(row[0]) if row else None
