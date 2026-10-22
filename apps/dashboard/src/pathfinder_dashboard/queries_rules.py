"""Business rules (spec 039 design § 11, UX-R60–R63, designer screens v2-11 / v2-12): the portal's
decision rules as decision tables, with where each is decided, its status in the UI's words, the
boundary tests and the history. Read-only."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from typing import Any

# The UI's rule statuses (12-v2-ux.md § 4) from the hypothesis lifecycle.
RULE_STATUS = {
    "proposed": "proposed",
    "testing": "proposed",
    "supported": "tested",
    "confirmed": "confirmed",
    "refuted": "broken",
    "rejected": "rejected",
    # Superseded without a newer rule in its place: the rule changed on a release (decision drift,
    # R8) and waits to be re-mined; with one (`superseded_by`), it is replaced.
    "superseded": "changed",
}
# Shown first: what needs a person.
ORDER = ("broken", "changed", "proposed", "tested", "confirmed", "replaced", "rejected")
GROUP_WORD = {
    "broken": "Broken",
    "changed": "Changed",
    "proposed": "Proposed",
    "tested": "Tested",
    "confirmed": "Confirmed",
    "replaced": "Replaced",
    "rejected": "Rejected",
}


@dataclass(frozen=True)
class RuleRow:
    key: str  # the hypothesis key, H-nnnn
    claim: str
    status: str  # UI status
    screen_key: str | None
    screen_title: str | None
    action: str | None
    passed: int
    failed: int
    waiting: int
    last_tested: str | None
    fitness: float | None
    rows: int | None
    # The BA's business rule record (BR-nnn) that documents the rule, when one cites it.
    br_key: str | None = None

    @property
    def shown_key(self) -> str:
        """The key people use: BR-nnn once documented, else the hypothesis key."""
        return self.br_key or self.key


@dataclass(frozen=True)
class RulesView:
    rules: list[RuleRow]
    counts: dict[str, int]
    status: str | None  # the filter

    def groups(self) -> list[tuple[str, list[RuleRow]]]:
        shown = [r for r in self.rules if self.status in (None, r.status)]
        return [
            (s, [r for r in shown if r.status == s])
            for s in ORDER
            if any(r.status == s for r in shown)
        ]


@dataclass(frozen=True)
class BoundaryTest:
    inputs: dict[str, Any]
    expect: str
    got: str | None
    verdict: str | None
    at: str


@dataclass(frozen=True)
class RuleEvent:
    status: str
    actor: str
    reason: str
    at: str
    undo: bool = False  # a person took back the decision before it (spec 040 T010)


@dataclass(frozen=True)
class Wording:
    """A person's sentence for the rule (Reword, FR-007): the documentation and export use it."""

    wording: str
    actor: str
    reason: str | None
    at: str


@dataclass(frozen=True)
class RuleDetail:
    row: RuleRow
    inputs: list[str]
    table: list[tuple[list[str], str]]  # (a condition per input, outcome)
    hit_policy: str
    tests: list[BoundaryTest] = field(default_factory=list)
    history: list[RuleEvent] = field(default_factory=list)
    needs_data: bool = False
    wordings: list[Wording] = field(default_factory=list)  # newest first; the first is in force

    @property
    def wording(self) -> Wording | None:
        return self.wordings[0] if self.wordings else None


def _rows(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []  # a store before migration 0031


_SELECT = (
    "SELECT h.id, h.key, h.claim, h.claim_json, h.fitness, h.superseded_by,"
    "  (SELECT e.to_status FROM hypothesis_events e WHERE e.hypothesis_id = h.id"
    "     ORDER BY e.at DESC, e.id DESC LIMIT 1) AS hstatus,"
    "  (SELECT count(*) FROM hypothesis_tests t WHERE t.hypothesis_id = h.id"
    "     AND t.verdict = 'pass') AS passed,"
    "  (SELECT count(*) FROM hypothesis_tests t WHERE t.hypothesis_id = h.id"
    "     AND t.verdict = 'fail') AS failed,"
    "  (SELECT count(*) FROM hypothesis_tests t WHERE t.hypothesis_id = h.id"
    "     AND t.verdict IS NULL) AS waiting,"
    "  (SELECT max(t.created_at) FROM hypothesis_tests t WHERE t.hypothesis_id = h.id"
    "     AND t.verdict IS NOT NULL) AS last_tested,"
    # Owner answer 18 (b): the BA's business rule record citing the hypothesis gives the rule its
    # BR key, the same key everywhere; until one does, the rule is known by its H key.
    "  (SELECT r.key FROM doc_evidence e JOIN doc_revisions v ON v.id = e.revision_id"
    "     JOIN doc_records r ON r.id = v.record_id AND v.rev_no = r.latest_rev"
    "     WHERE e.target_kind = 'hypothesis' AND e.target_id = h.id"
    "       AND r.kind = 'business_rule' AND r.withdrawn = 0 ORDER BY r.seq LIMIT 1) AS br_key"
    " FROM hypotheses h WHERE h.portal_id = ? AND h.kind = 'decision_rule'"
)


def _screen_titles(conn: sqlite3.Connection, portal: str) -> dict[str, str]:
    rows = _rows(conn, "SELECT key, title FROM model_screens WHERE portal_id = ?", (portal,))
    return {r["key"]: r["title"] for r in rows}


def _row(r: sqlite3.Row, titles: dict[str, str]) -> RuleRow:
    claim = json.loads(r["claim_json"])
    point = claim.get("decisionPoint") or claim.get("table", {}).get("decision_point") or {}
    screen = point.get("screen")
    status = RULE_STATUS.get(r["hstatus"] or "proposed", "proposed")
    if status == "changed" and r["superseded_by"]:
        status = "replaced"
    return RuleRow(
        key=r["key"],
        claim=r["claim"],
        status=status,
        screen_key=screen,
        screen_title=titles.get(screen) if screen else None,
        action=point.get("action"),
        passed=r["passed"],
        failed=r["failed"],
        waiting=r["waiting"],
        last_tested=r["last_tested"],
        fitness=r["fitness"],
        rows=claim.get("rows"),
        br_key=r["br_key"],
    )


def rules_view(conn: sqlite3.Connection, portal: str | None, status: str | None) -> RulesView:
    if not portal:
        return RulesView([], {}, status)
    titles = _screen_titles(conn, portal)
    rules = [_row(r, titles) for r in _rows(conn, _SELECT + " ORDER BY h.key", (portal,))]
    counts: dict[str, int] = {}
    for r in rules:
        counts[r.status] = counts.get(r.status, 0) + 1
    return RulesView(rules, counts, status if status in ORDER else None)


def rule_detail(conn: sqlite3.Connection, portal: str, key: str) -> RuleDetail | None:
    """A rule by its hypothesis key (H-nnnn) or by the BR key of the record documenting it."""
    found = _rows(conn, _SELECT + " AND (h.key = ? OR br_key = ?)", (portal, key, key))
    if not found:
        return None
    r = found[0]
    row = _row(r, _screen_titles(conn, portal))
    claim = json.loads(r["claim_json"])
    inputs = [i["name"] for i in claim.get("inputs", [])]
    table = [
        ([rule["when"].get(n, "any") for n in inputs], rule["then"])
        for rule in claim.get("rules", [])
    ]
    tests = [
        BoundaryTest(
            inputs=json.loads(t["inputs_json"]),
            expect=", ".join(json.loads(t["refutes_if_json"]).get("notIn", [])),
            got=(json.loads(t["result_json"]) or {}).get("outcome") if t["result_json"] else None,
            verdict=t["verdict"],
            at=t["created_at"],
        )
        for t in _rows(
            conn,
            "SELECT inputs_json, refutes_if_json, result_json, verdict, created_at"
            " FROM hypothesis_tests WHERE hypothesis_id = ? ORDER BY created_at, id",
            (r["id"],),
        )
    ]
    history = [
        RuleEvent(
            status=e["to_status"],
            actor=e["actor"],
            reason=e["reason"],
            at=e["at"],
            undo=e["undoes"] is not None,
        )
        for e in _rows(
            conn,
            "SELECT to_status, actor, reason, at, undoes FROM hypothesis_events"
            " WHERE hypothesis_id = ? ORDER BY at DESC, id DESC",
            (r["id"],),
        )
    ]
    wordings = [
        Wording(**dict(w))
        for w in _rows(
            conn,
            "SELECT wording, actor, reason, at FROM hypothesis_wordings WHERE hypothesis_id = ?"
            " ORDER BY at DESC, id DESC",
            (r["id"],),
        )
    ]
    return RuleDetail(
        row=row,
        inputs=inputs,
        table=table,
        hit_policy="first match" if claim.get("hitPolicy") == "U" else "any match (collect)",
        tests=tests,
        history=history,
        needs_data=bool(claim.get("needs_data")),
        wordings=wordings,
    )
