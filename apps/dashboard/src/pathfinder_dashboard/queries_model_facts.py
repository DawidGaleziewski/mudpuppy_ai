"""What the portal model knows of one process (spec 039 design § 13–14, UX-R51–R54, designer
screen v2-10): how journeys entered it (triggers), how they ended (outcomes), the paths walked
(trace variants), how far it was explored, and the business rules decided on its screens. The
same facts as the store's `processModelFacts` (the export), read from the stored instances.
Read-only."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from typing import Any

from .queries_rules import RuleRow, rules_view


@dataclass(frozen=True)
class Trigger:
    screen_key: str | None
    screen_title: str | None
    element: str
    count: int
    # A URL opened on the start screen (owner answer 10): no screen or element it came from.
    deep_link: bool = False


@dataclass(frozen=True)
class Exploration:
    depth: int
    random_walks: int
    new_deviations: int
    completed_at: str


@dataclass(frozen=True)
class Path:
    """A trace variant (v2-10 Paths): one distinct sequence of screens walked, how it ended and
    how many instances walked it."""

    name: str  # A, B, C… by how often it was walked
    screens: list[tuple[str, str]]  # (SC key, title)
    outcome: str
    count: int


@dataclass(frozen=True)
class ModelFacts:
    model_seq: int | None
    triggers: list[Trigger] = field(default_factory=list)
    outcomes: dict[str, int] = field(default_factory=dict)
    explored: Exploration | None = None
    rules: list[RuleRow] = field(default_factory=list)
    paths: list[Path] = field(default_factory=list)


def _paths(conn: sqlite3.Connection, portal: str, process_id: str, version: str) -> list[Path]:
    """The instances' walked screens (migration 0043), grouped; rows written before it are left
    out until the next rebuild."""
    names = {
        r["id"]: (r["key"], r["title"])
        for r in _rows(
            conn, "SELECT id, key, title FROM model_screens WHERE portal_id = ?", (portal,)
        )
    }
    rows = _rows(
        conn,
        "SELECT screens_json, outcome, count(*) AS n FROM process_instances"
        " WHERE process_id = ? AND model_version_id = ? AND screens_json IS NOT NULL"
        " GROUP BY screens_json, outcome ORDER BY n DESC, screens_json, outcome",
        (process_id, version),
    )
    return [
        Path(
            name=chr(ord("A") + i) if i < 26 else str(i + 1),
            screens=[names.get(s, (s, s)) for s in json.loads(r["screens_json"])],
            outcome=r["outcome"],
            count=r["n"],
        )
        for i, r in enumerate(rows)
    ]


def _rows(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []  # a store before migration 0036


def _screen_keys(conn: sqlite3.Connection, states: list[str]) -> set[str]:
    """The current model screens of `states`, by key."""
    if not states:
        return set()
    marks = ",".join("?" * len(states))
    rows = _rows(
        conn,
        "SELECT s.key FROM screen_members m JOIN model_screens s ON s.id = m.screen_id"
        f" WHERE m.to_model_version IS NULL AND m.state_id IN ({marks})",
        tuple(states),
    )
    return {r["key"] for r in rows}


def model_facts(
    conn: sqlite3.Connection, portal: str, process_id: str, as_is_steps: list[dict[str, Any]]
) -> ModelFacts:
    """`as_is_steps`: A's latest steps, whose states give the process's screens."""
    version = _rows(
        conn,
        "SELECT id, seq FROM model_versions WHERE portal_id = ? ORDER BY seq DESC LIMIT 1",
        (portal,),
    )
    if not version:
        return ModelFacts(None)
    vid, seq = version[0]["id"], version[0]["seq"]
    triggers = [
        Trigger(r["skey"], r["stitle"], r["element"] or "—", r["n"], r["kind"] == "deep_link")
        for r in _rows(
            conn,
            "SELECT i.trigger_kind AS kind, s.key AS skey, s.title AS stitle,"
            " t.element_key AS element, count(*) AS n"
            " FROM process_instances i LEFT JOIN transitions t ON t.id = i.trigger_transition_id"
            " LEFT JOIN screen_members m"
            "   ON m.state_id = t.from_state AND m.to_model_version IS NULL"
            " LEFT JOIN model_screens s ON s.id = m.screen_id"
            " WHERE i.process_id = ? AND i.model_version_id = ?"
            " GROUP BY i.trigger_kind, s.key, t.element_key ORDER BY n DESC, s.key",
            (process_id, vid),
        )
    ]
    outcomes = {
        r["outcome"]: r["n"]
        for r in _rows(
            conn,
            "SELECT outcome, count(*) AS n FROM process_instances"
            " WHERE process_id = ? AND model_version_id = ? GROUP BY outcome ORDER BY outcome",
            (process_id, vid),
        )
    }
    last = _rows(
        conn,
        "SELECT depth, random_walks, new_deviations, completed_at FROM process_explorations"
        " WHERE process_id = ? ORDER BY completed_at DESC LIMIT 1",
        (process_id,),
    )
    explored = Exploration(**dict(last[0])) if last else None
    keys = _screen_keys(conn, [s["state_id"] for s in as_is_steps if s.get("state_id")])
    rules = [r for r in rules_view(conn, portal, None).rules if r.screen_key in keys]
    return ModelFacts(
        seq, triggers, outcomes, explored, rules, _paths(conn, portal, process_id, vid)
    )
