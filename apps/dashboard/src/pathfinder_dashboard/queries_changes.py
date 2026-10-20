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
class DecisionRule:
    """A mined business rule (spec 039 design § 11) and what its boundary tests said."""

    key: str
    claim: str
    status: str | None  # hypothesis lifecycle: proposed · testing · supported · confirmed · …
    reason: str | None
    screen_key: str | None
    fitness: float | None
    rows: int | None
    passed: int
    failed: int
    inconclusive: int
    untested: int


@dataclass(frozen=True)
class ChangesView:
    portal: str | None
    latest_seq: int | None
    needs_you: list[Change]
    explained: list[Change]
    waiting: list[Change]
    rules: list[DecisionRule]
    threshold: Threshold | None = None


@dataclass(frozen=True)
class Threshold:
    """The screen threshold τ of the latest model version (spec 039 T115, owner answer 7)."""

    profile: str | None
    tau: float
    accepted_by: str | None  # None: the profile's default, no person accepted one yet
    accepted_at: str | None
    labels: int  # pair labels of the portal so far


def _rows(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []  # a store before migration 0031


def decision_rules(conn: sqlite3.Connection, portal: str) -> list[DecisionRule]:
    """The portal's decision rules in key order, with their latest status and test verdicts."""
    rows = _rows(
        conn,
        "SELECT h.key, h.claim, h.fitness, json_extract(h.claim_json, '$.rows') AS nrows,"
        "  json_extract(h.claim_json, '$.decisionPoint.screen') AS screen,"
        "  (SELECT e.to_status FROM hypothesis_events e WHERE e.hypothesis_id = h.id"
        "     ORDER BY e.at DESC, e.id DESC LIMIT 1) AS hstatus,"
        "  (SELECT e.reason FROM hypothesis_events e WHERE e.hypothesis_id = h.id"
        "     ORDER BY e.at DESC, e.id DESC LIMIT 1) AS reason,"
        "  (SELECT count(*) FROM hypothesis_tests t WHERE t.hypothesis_id = h.id"
        "     AND t.verdict = 'pass') AS passed,"
        "  (SELECT count(*) FROM hypothesis_tests t WHERE t.hypothesis_id = h.id"
        "     AND t.verdict = 'fail') AS failed,"
        "  (SELECT count(*) FROM hypothesis_tests t WHERE t.hypothesis_id = h.id"
        "     AND t.verdict = 'inconclusive') AS inconclusive,"
        "  (SELECT count(*) FROM hypothesis_tests t WHERE t.hypothesis_id = h.id"
        "     AND t.verdict IS NULL) AS untested"
        " FROM hypotheses h WHERE h.portal_id = ? AND h.kind = 'decision_rule' ORDER BY h.key",
        (portal,),
    )
    return [
        DecisionRule(
            key=r["key"],
            claim=r["claim"],
            status=r["hstatus"],
            reason=r["reason"],
            screen_key=r["screen"],
            fitness=r["fitness"],
            rows=r["nrows"],
            passed=r["passed"],
            failed=r["failed"],
            inconclusive=r["inconclusive"],
            untested=r["untested"],
        )
        for r in rows
    ]


def threshold_of(conn: sqlite3.Connection, portal: str) -> Threshold | None:
    """τ as the reconciler last used it, and whether a person accepted it for that profile."""
    version = _rows(
        conn,
        "SELECT threshold, fingerprint_profile FROM model_versions WHERE portal_id = ?"
        " ORDER BY seq DESC LIMIT 1",
        (portal,),
    )
    if not version:
        return None
    profile = version[0]["fingerprint_profile"]
    accepted = _rows(
        conn,
        "SELECT accepted_by, accepted_at FROM tau_acceptances WHERE portal_id = ? AND profile = ?"
        " ORDER BY accepted_at DESC, id DESC LIMIT 1",
        (portal, profile),
    )
    labels = _rows(
        conn, "SELECT count(*) AS n FROM state_pair_labels WHERE portal_id = ?", (portal,)
    )
    return Threshold(
        profile=profile,
        tau=version[0]["threshold"],
        accepted_by=accepted[0]["accepted_by"] if accepted else None,
        accepted_at=accepted[0]["accepted_at"] if accepted else None,
        labels=labels[0]["n"] if labels else 0,
    )


def changes_view(conn: sqlite3.Connection, portal: str | None) -> ChangesView:
    if not portal:
        return ChangesView(None, None, [], [], [], [])
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
    # Explained: a derived fact confirmed by its rule, or a deviation another one's fact covers
    # (a rename's new button, explained by `replaces` on the old one: F-23@039).
    explained = [
        c
        for c in changes
        if (c.derived and c.hypothesis_status == "confirmed")
        or (c.status == "explained" and c.hypothesis_key is None)
    ]
    waiting = [c for c in changes if c.status == "waiting_test"]
    needs_you = [c for c in changes if c not in explained and c not in waiting]
    return ChangesView(
        portal=portal,
        latest_seq=latest[0]["n"] if latest else None,
        needs_you=needs_you,
        explained=explained,
        waiting=waiting,
        rules=decision_rules(conn, portal),
        threshold=threshold_of(conn, portal),
    )
