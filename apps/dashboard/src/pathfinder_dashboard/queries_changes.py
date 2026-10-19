"""Read model of What changed (spec 039 M3, ux-requirements.md UX-R10–R13): the deviations the
reconciler found between consecutive model versions of a portal, each with the hypothesis that
explains it (derived by a rule, or waiting for a person) or none yet (the agent's queue).
Functional page; the UX designer's layout replaces it (T100). Read-only."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from typing import Any

# Kinds as the BA reads them (ux-requirements § 2: plain words).
KIND_WORDS = {
    "new_screen": "New screen",
    "new_member": "Screen looks different",
    "new_action": "New action",
    "missing_action": "Action gone",
    "target_mismatch": "Leads elsewhere now",
    "result_mismatch": "Result changed",
    "rule_mismatch": "Business rule broke",
}


@dataclass(frozen=True)
class Change:
    kind: str
    word: str
    screen_key: str | None
    screen_title: str | None
    element_key: str | None
    status: str  # open · waiting_test · explained
    hypothesis_key: str | None
    claim: str | None
    rule: str | None
    derived: bool
    hypothesis_status: str | None
    reason: str | None
    model_seq: int
    created_at: str
    before: Any
    after: Any


@dataclass(frozen=True)
class ChangesView:
    portal: str | None
    latest_seq: int | None
    needs_you: list[Change]
    explained: list[Change]
    waiting: list[Change]


def _rows(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []  # a store before migration 0031


def changes_view(conn: sqlite3.Connection, portal: str | None) -> ChangesView:
    if not portal:
        return ChangesView(None, None, [], [], [])
    rows = _rows(
        conn,
        "SELECT d.kind, d.status, d.before_json, d.after_json, d.created_at, mv.seq,"
        "  s.key AS screen_key, s.title AS screen_title, a.element_key,"
        "  h.key AS hkey, h.claim, h.rule, h.derived,"
        "  (SELECT e.to_status FROM hypothesis_events e WHERE e.hypothesis_id = h.id"
        "     ORDER BY e.at DESC, e.id DESC LIMIT 1) AS hstatus,"
        "  (SELECT e.reason FROM hypothesis_events e WHERE e.hypothesis_id = h.id"
        "     ORDER BY e.at DESC, e.id DESC LIMIT 1) AS reason"
        " FROM deviations d JOIN model_versions mv ON mv.id = d.model_version_id"
        " LEFT JOIN model_screens s ON s.id = d.screen_id"
        " LEFT JOIN action_classes a ON a.id = d.action_class_id"
        " LEFT JOIN hypotheses h ON h.deviation_id = d.id"
        " WHERE d.portal_id = ? ORDER BY mv.seq DESC, d.created_at DESC, d.id",
        (portal,),
    )
    latest = _rows(conn, "SELECT max(seq) AS n FROM model_versions WHERE portal_id = ?", (portal,))
    changes = [
        Change(
            kind=r["kind"],
            word=KIND_WORDS.get(r["kind"], r["kind"]),
            screen_key=r["screen_key"],
            screen_title=r["screen_title"],
            element_key=r["element_key"],
            status=r["status"],
            hypothesis_key=r["hkey"],
            claim=r["claim"],
            rule=r["rule"],
            derived=bool(r["derived"]),
            hypothesis_status=r["hstatus"],
            reason=r["reason"],
            model_seq=r["seq"],
            created_at=r["created_at"],
            before=json.loads(r["before_json"]) if r["before_json"] else None,
            after=json.loads(r["after_json"]) if r["after_json"] else None,
        )
        for r in rows
    ]
    explained = [c for c in changes if c.derived and c.hypothesis_status == "confirmed"]
    waiting = [c for c in changes if c.status == "waiting_test"]
    needs_you = [c for c in changes if c not in explained and c not in waiting]
    return ChangesView(
        portal=portal,
        latest_seq=latest[0]["n"] if latest else None,
        needs_you=needs_you,
        explained=explained,
        waiting=waiting,
    )
