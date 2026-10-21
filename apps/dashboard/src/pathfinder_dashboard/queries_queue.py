"""The 2.0 groups of the Review queue (spec 039 T100, designer screens v2-04 / v2-05 / v2-16,
12-v2-ux.md § 5): what the portal model needs a person for, beside the records, amendments and
suites of `queries_review`. Findings are changes no rule explained; Rules are mined business rules
waiting for a person, and broken or changed ones; Removals are actions gone without a release,
decided together; Processes are the model's process proposals (decided on Processes). Explained
automatically and Decided are the other two tabs. Read-only."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Any

from .queries_changes import Change, Explanation, changes_view, rows_of

RULE_HYPOTHESES = ("decision_point", "decision_drift")
# Who writes hypothesis events without a person (store: reconciler, miner, replay; the agents).
MACHINE_ACTORS = ("reconciler", "miner", "replay", "crawler", "ba-agent")


@dataclass(frozen=True)
class QueueItem:
    id: str  # the `select=<kind>:<id>` part: a deviation id, a hypothesis key or a suggestion id
    chip: Explanation
    claim: str
    hint: str
    where: str | None
    keys: tuple[str, ...]  # the hypotheses a decision settles; empty: nothing to decide here
    at: str
    href: str | None  # the item's own page
    status: str | None = None  # rule vocabulary, for rules


@dataclass(frozen=True)
class Decided:
    key: str
    claim: str
    kind: str
    to_status: str
    actor: str
    reason: str | None
    at: str


def _finding(c: Change) -> QueueItem:
    return QueueItem(
        id=c.id,
        chip=c.explanation,
        claim=c.finding,
        hint=f"{c.word} · model version {c.model_seq}",
        where=c.screen_title,
        keys=(c.hypothesis_key,) if c.hypothesis_key else (),
        at=c.created_at,
        href=f"/changes/{c.id}",
    )


def _is_rule(c: Change) -> bool:
    return c.kind == "rule_mismatch" or c.explanation.word in ("Rule decides", "Rule changed")


def findings_rules_removals(
    conn: sqlite3.Connection, portal: str
) -> tuple[list[QueueItem], list[QueueItem], list[QueueItem]]:
    """Every change that needs a person, newest first, cut into the three groups."""
    needs = changes_view(conn, portal, show="needs").all_changes()
    needs.sort(key=lambda c: c.created_at, reverse=True)
    removals = [_finding(c) for c in needs if c.kind == "missing_action"]
    rules = [_finding(c) for c in needs if c.kind != "missing_action" and _is_rule(c)]
    findings = [_finding(c) for c in needs if c.kind != "missing_action" and not _is_rule(c)]
    return findings, rules + mined_rules(conn, portal), removals


def mined_rules(conn: sqlite3.Connection, portal: str) -> list[QueueItem]:
    """Mined decision rules a person has not settled: proposed, tested (supported) or broken."""
    rows = rows_of(
        conn,
        "SELECT h.key, h.claim, h.created_at,"
        "  json_extract(h.claim_json, '$.decisionPoint.screen') AS screen,"
        "  (SELECT e.to_status FROM hypothesis_events e WHERE e.hypothesis_id = h.id"
        "     ORDER BY e.at DESC, e.id DESC LIMIT 1) AS status"
        " FROM hypotheses h WHERE h.portal_id = ? AND h.kind = 'decision_rule'"
        " ORDER BY h.created_at DESC, h.key",
        (portal,),
    )
    word = {
        "proposed": "proposed",
        "testing": "proposed",
        "supported": "tested",
        "refuted": "broken",
    }
    return [
        QueueItem(
            id=r["key"],
            chip=Explanation("Rule", "fail" if r["status"] == "refuted" else "", ""),
            claim=r["claim"],
            hint=f"decided on {r['screen']}" if r["screen"] else "mined from the cases",
            where=r["screen"],
            keys=(r["key"],),
            at=r["created_at"],
            href=f"/rules/{r['key']}",
            status=word[r["status"]],
        )
        for r in rows
        if r["status"] in word
    ]


def process_proposals(conn: sqlite3.Connection, portal: str) -> list[QueueItem]:
    return [
        QueueItem(
            id=r["id"],
            chip=Explanation("Proposed", "tobe", ""),
            claim=r["name"],
            hint=r["why"],
            where=None,
            keys=(),
            at=r["created_at"],
            href=f"/processes?suggestion={r['id']}",
        )
        for r in rows_of(
            conn,
            "SELECT id, name, why, created_at FROM grouping_suggestions"
            " WHERE portal_id = ? AND status = 'open' ORDER BY created_at DESC",
            (portal,),
        )
    ]


def explained(conn: sqlite3.Connection, portal: str) -> list[Change]:
    """Changes a rule explained, newest first (Overturn waits for R-87)."""
    items = changes_view(conn, portal, show="explained").all_changes()
    return sorted(items, key=lambda c: c.created_at, reverse=True)


def decided(conn: sqlite3.Connection, portal: str, limit: int = 200) -> list[Decided]:
    """A person's confirmations and rejections of the portal model, newest first."""
    marks = ",".join("?" * len(MACHINE_ACTORS))
    rows = rows_of(
        conn,
        "SELECT h.key, h.claim, h.kind, e.to_status, e.actor, e.reason, e.at"
        " FROM hypothesis_events e JOIN hypotheses h ON h.id = e.hypothesis_id"
        f" WHERE h.portal_id = ? AND e.actor NOT IN ({marks})"
        " AND e.to_status IN ('confirmed', 'rejected')"
        " ORDER BY e.at DESC, e.id DESC LIMIT ?",
        (portal, *MACHINE_ACTORS, limit),
    )
    return [Decided(**dict(r)) for r in rows]


def by_id(items: list[QueueItem], ident: str) -> Any:
    return next((i for i in items if i.id == ident), None)
