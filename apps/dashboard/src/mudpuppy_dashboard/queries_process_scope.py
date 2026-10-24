"""A process's scope and merges (spec 078; designer T-05, T-06): the screens in a scope that no
observed move reaches yet, the processes a screen can be added to, and the merges a process took
part in. Read-only; a store before migration 0051 has none of them."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from typing import Any


def _rows(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []  # a store before 0051


@dataclass(frozen=True)
class OffPath:
    state: str
    title: str
    route: str


def off_path(conn: sqlite3.Connection, process_id: str) -> list[OffPath]:
    """The process's "Not on the observed path yet" screens, in the order they were added."""
    return [
        OffPath(state=r["state_id"], title=r["title"] or "", route=r["route_template"] or "")
        for r in _rows(
            conn,
            "SELECT c.state_id, s.title, s.route_template FROM process_scope_screens c"
            " JOIN states s ON s.id = c.state_id WHERE c.process_id = ? AND c.removed_at IS NULL"
            " ORDER BY c.added_at, c.id",
            (process_id,),
        )
    ]


def scoped_states(conn: sqlite3.Connection, portal: str) -> set[str]:
    """Every screen in a scope (not on an observed path yet) of a process in use."""
    return {
        r[0]
        for r in _rows(
            conn,
            "SELECT c.state_id FROM process_scope_screens c JOIN ba_processes p"
            " ON p.id = c.process_id WHERE p.portal_id = ? AND p.archived_at IS NULL"
            " AND c.removed_at IS NULL",
            (portal,),
        )
    }


LOOSE_FACTS_SQL = (
    "SELECT st.id, (SELECT max(o.created_at) FROM observations o WHERE o.state_id = st.id) AS seen,"
    " (SELECT ms.key FROM screen_members m JOIN model_screens ms ON ms.id = m.screen_id"
    "  WHERE m.state_id = st.id AND m.to_model_version IS NULL) AS screen_key,"
    " (SELECT count(*) FROM screen_members x WHERE x.to_model_version IS NULL AND x.screen_id ="
    "  (SELECT m.screen_id FROM screen_members m WHERE m.state_id = st.id"
    "   AND m.to_model_version IS NULL)) AS variants,"
    " (SELECT json_group_array(p) FROM (SELECT DISTINCT so.persona_id AS p"
    "  FROM state_observations so WHERE so.state_id = st.id ORDER BY p)) AS personas"
    " FROM states st WHERE st.id IN ({marks})"
)


def loose_facts(conn: sqlite3.Connection, states: list[str]) -> dict[str, dict[str, Any]]:
    """For the sorting grid (designer T-05): each screen's model screen, last sighting, how many
    variants that screen has, and the personas whose scans recorded it (spec 079 FR-003, D-6)."""
    if not states:
        return {}
    sql = LOOSE_FACTS_SQL.format(marks=",".join("?" * len(states)))
    return {
        r["id"]: {
            "screen_key": r["screen_key"],
            "last_seen": r["seen"],
            "variants": max(1, int(r["variants"] or 0)),
            "personas": json.loads(r["personas"] or "[]"),
        }
        for r in _rows(conn, sql, tuple(states))
    }


@dataclass(frozen=True)
class Target:
    """A saved process a screen can be added to, with the screens already in it."""

    id: str
    key: str
    name: str
    persona: str
    steps: int
    states: list[str]


def targets(conn: sqlite3.Connection, portal: str) -> list[Target]:
    """The portal's saved processes in use, A–Z by name (the Add to process menu)."""
    rows = _rows(
        conn,
        "SELECT p.id, p.key, p.name, p.persona, r.steps FROM ba_processes p JOIN process_models v"
        " ON v.process_id = p.id AND v.label = 'A' JOIN process_model_revisions r"
        " ON r.model_id = v.id AND r.rev = v.rev WHERE p.portal_id = ? AND p.archived_at IS NULL"
        " ORDER BY p.name COLLATE NOCASE, p.key",
        (portal,),
    )
    out = []
    for r in rows:
        steps = [s for s in json.loads(r["steps"]) if isinstance(s, dict)]
        states = [str(s["state_id"]) for s in steps if s.get("state_id")]
        extra = [o.state for o in off_path(conn, r["id"])]
        out.append(Target(r["id"], r["key"], r["name"], r["persona"], len(steps), states + extra))
    return out


@dataclass(frozen=True)
class Merge:
    id: str
    kept_key: str
    kept_name: str
    absorbed_key: str
    absorbed_name: str
    author: str
    reason: str | None
    at: str
    undone_at: str | None


MERGE_SQL = (
    "SELECT m.id, k.key AS kept_key, k.name AS kept_name, a.key AS absorbed_key,"
    " a.name AS absorbed_name, m.author, m.reason, m.created_at, m.undone_at"
    " FROM process_merges m JOIN ba_processes k ON k.id = m.kept_process_id"
    " JOIN ba_processes a ON a.id = m.absorbed_process_id"
)


def _merge(r: sqlite3.Row) -> Merge:
    return Merge(
        id=r["id"],
        kept_key=r["kept_key"],
        kept_name=r["kept_name"],
        absorbed_key=r["absorbed_key"],
        absorbed_name=r["absorbed_name"],
        author=r["author"],
        reason=r["reason"],
        at=r["created_at"],
        undone_at=r["undone_at"],
    )


def merges_of(conn: sqlite3.Connection, process_id: str) -> list[Merge]:
    """The merges this process took part in, kept or absorbed, newest first (History's events)."""
    return [
        _merge(r)
        for r in _rows(
            conn,
            MERGE_SQL + " WHERE m.kept_process_id = ? OR m.absorbed_process_id = ?"
            " ORDER BY m.created_at DESC",
            (process_id, process_id),
        )
    ]


def merged_into(conn: sqlite3.Connection, process_id: str) -> Merge | None:
    """The open merge that absorbed this process ("Merged into PRC-001"), if any."""
    rows = _rows(
        conn, MERGE_SQL + " WHERE m.absorbed_process_id = ? AND m.undone_at IS NULL", (process_id,)
    )
    return _merge(rows[0]) if rows else None


def from_other_process(conn: sqlite3.Connection, process_id: str) -> set[str]:
    """Labels of this process's to-be models branched from another process's as-is (moved over by
    a merge): they must be re-based before Compare uses them."""
    return {
        r[0]
        for r in _rows(
            conn,
            "SELECT v.label FROM process_models v JOIN process_models f"
            " ON f.id = v.branched_from_model_id WHERE v.process_id = ? AND f.process_id <> ?",
            (process_id, process_id),
        )
    }
