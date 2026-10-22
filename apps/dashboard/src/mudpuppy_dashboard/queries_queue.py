"""The 2.0 groups of the Review queue (spec 039 T100, designer screens v2-04 / v2-05 / v2-16,
12-v2-ux.md § 5): what the portal model needs a person for, beside the records, amendments and
suites of `queries_review`. Findings are changes no rule explained; Rules are mined business rules
waiting for a person, and broken or changed ones; Removals are actions gone without a release,
decided together; Processes are the model's process proposals (decided on Processes). Explained
automatically and Decided are the other two tabs. Read-only."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from .queries_changes import Change, ChangeFilter, Explanation, changes_view, rows_of
from .queries_releases import part_name

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
    # Items alike enough to decide together (designer § 5.4): same kind, same explanation, same
    # model version, e.g. "Removed · Rule decides · model version 4". None: decided alone.
    group: str | None = None
    part: str | None = None  # the portal part its screen is served by ("App kalkulator"), if known


@dataclass(frozen=True)
class Similar:
    """A system-made group of a queue (§ 5.4): one checkbox, one action ("Confirm 12")."""

    label: str
    keys: tuple[str, ...]
    ids: tuple[str, ...]


def similar(items: list[QueueItem]) -> list[Similar]:
    """The groups of two or more decidable items, in queue order of their first item."""
    groups: dict[str, list[QueueItem]] = {}
    for it in items:
        if it.group and it.keys:
            groups.setdefault(it.group, []).append(it)
    return [
        Similar(
            label,
            tuple(k for it in alike for k in it.keys),
            tuple(it.id for it in alike),
        )
        for label, alike in groups.items()
        if len(alike) > 1
    ]


@dataclass(frozen=True)
class Decided:
    key: str
    claim: str
    kind: str
    to_status: str
    actor: str
    reason: str | None
    at: str
    undone: bool = False  # a person took it back with Undo (spec 040 T010)


def screen_parts(conn: sqlite3.Connection, portal: str) -> dict[str, str]:
    """Model screen key → the portal part serving it (12-v2-ux § 2: releases per part): the
    embedded app or frame seen most on its members' visits, else the shell."""
    rows = rows_of(
        conn,
        "SELECT ms.key, b.scope, count(*) AS n FROM model_screens ms"
        " JOIN screen_members sm ON sm.screen_id = ms.id AND sm.to_model_version IS NULL"
        " JOIN observations o ON o.state_id = sm.state_id"
        " JOIN observation_builds ob ON ob.observation_id = o.id"
        " JOIN builds b ON b.id = ob.build_id"
        " WHERE ms.portal_id = ? GROUP BY ms.key, b.scope",
        (portal,),
    )
    best: dict[str, tuple[bool, int, str]] = {}
    for r in rows:
        rank = (r["scope"] != "shell", int(r["n"]), str(r["scope"]))
        if r["key"] not in best or rank > best[r["key"]]:
            best[r["key"]] = rank
    return {key: part_name(scope) for key, (_, _, scope) in best.items()}


AGES = (("today", "Today"), ("week", "This week"), ("older", "Older"))


def age_of(at: str, now: datetime) -> str:
    """The age filter's bucket of an item (designer § 5.1: kind, part, process, age)."""
    days = (now - datetime.fromisoformat(at.replace("Z", "+00:00"))).total_seconds() / 86400
    return "today" if days < 1 else "week" if days < 7 else "older"


@dataclass(frozen=True)
class Facets:
    """The queue's filters with counts over the model groups (the counts follow the filters)."""

    parts: list[tuple[str, int]]
    ages: list[tuple[str, str, int]]
    part: str | None
    age: str | None

    @property
    def active(self) -> bool:
        return bool(self.part or self.age)


def facets(
    groups: list[list[QueueItem]], part: str | None, age: str | None, now: datetime
) -> Facets:
    items = [it for g in groups for it in g]
    by_part = [it for it in items if not age or age_of(it.at, now) == age]
    by_age = [it for it in items if not part or it.part == part]
    parts = sorted({it.part for it in by_part if it.part})
    return Facets(
        parts=[(p, sum(it.part == p for it in by_part)) for p in parts],
        ages=[(k, label, sum(age_of(it.at, now) == k for it in by_age)) for k, label in AGES],
        part=part if part in parts else None,
        age=age if age in dict(AGES) else None,
    )


def keep(items: list[QueueItem], f: Facets, now: datetime) -> list[QueueItem]:
    return [
        it
        for it in items
        if (not f.part or it.part == f.part) and (not f.age or age_of(it.at, now) == f.age)
    ]


def _finding(c: Change, parts: dict[str, str] | None = None) -> QueueItem:
    return QueueItem(
        id=c.id,
        chip=c.explanation,
        claim=c.finding,
        hint=f"{c.word} · model version {c.model_seq}",
        where=c.screen_title,
        keys=(c.hypothesis_key,) if c.hypothesis_key else (),
        at=c.created_at,
        href=f"/changes/{c.id}",
        group=f"{c.word} · {c.explanation.word} · model version {c.model_seq}",
        part=(parts or {}).get(c.screen_key or ""),
    )


def _is_rule(c: Change) -> bool:
    return c.kind == "rule_mismatch" or c.explanation.word in ("Rule decides", "Rule changed")


def findings_rules_removals(
    conn: sqlite3.Connection, portal: str
) -> tuple[list[QueueItem], list[QueueItem], list[QueueItem]]:
    """Every change that needs a person, newest first, cut into the three groups."""
    needs = changes_view(conn, portal, ChangeFilter(show="needs")).all_changes()
    needs.sort(key=lambda c: c.created_at, reverse=True)
    parts = screen_parts(conn, portal)
    removals = [_finding(c, parts) for c in needs if c.kind == "missing_action"]
    rules = [_finding(c, parts) for c in needs if c.kind != "missing_action" and _is_rule(c)]
    findings = [_finding(c, parts) for c in needs if c.kind != "missing_action" and not _is_rule(c)]
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
            group=f"Rule · {word[r['status']]}",
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
    items = changes_view(conn, portal, ChangeFilter(show="explained")).all_changes()
    return sorted(items, key=lambda c: c.created_at, reverse=True)


def decided(conn: sqlite3.Connection, portal: str, limit: int = 200) -> list[Decided]:
    """A person's confirmations and rejections of the portal model, newest first."""
    marks = ",".join("?" * len(MACHINE_ACTORS))
    rows = rows_of(
        conn,
        "SELECT h.key, h.claim, h.kind, e.to_status, e.actor, e.reason, e.at,"
        "  EXISTS (SELECT 1 FROM hypothesis_events u WHERE u.undoes = e.id) AS undone"
        " FROM hypothesis_events e JOIN hypotheses h ON h.id = e.hypothesis_id"
        f" WHERE h.portal_id = ? AND e.actor NOT IN ({marks}) AND e.undoes IS NULL"
        " AND e.to_status IN ('confirmed', 'rejected')"
        " ORDER BY e.at DESC, e.id DESC LIMIT ?",
        (portal, *MACHINE_ACTORS, limit),
    )
    return [Decided(**{**dict(r), "undone": bool(r["undone"])}) for r in rows]


DEFAULT_REASON = "Confirmed in Review."  # what Review sends for a confirm without a reason


def queue_kind(hypothesis_kind: str) -> str:
    """The Review group a hypothesis kind lands in (Removals, Rules, else Findings)."""
    if hypothesis_kind == "removed":
        return "removals"
    return "rules" if hypothesis_kind in (*RULE_HYPOTHESES, "decision_rule") else "findings"


def recent_reasons(
    conn: sqlite3.Connection, portal: str, per_kind: int = 3
) -> dict[str, list[str]]:
    """A person's last reasons per Review group, newest first, without repeats (designer § 5.3:
    the reason field suggests the last three for the same kind)."""
    marks = ",".join("?" * len(MACHINE_ACTORS))
    rows = rows_of(
        conn,
        "SELECT h.kind, e.reason FROM hypothesis_events e"
        " JOIN hypotheses h ON h.id = e.hypothesis_id"
        f" WHERE h.portal_id = ? AND e.actor NOT IN ({marks}) AND e.undoes IS NULL"
        " AND e.to_status IN ('confirmed', 'rejected') AND e.reason <> ?"
        " ORDER BY e.at DESC, e.id DESC LIMIT 200",
        (portal, *MACHINE_ACTORS, DEFAULT_REASON),
    )
    out: dict[str, list[str]] = {"findings": [], "rules": [], "removals": []}
    for r in rows:
        reason = str(r["reason"]).removeprefix("overturned: ")
        seen = out[queue_kind(r["kind"])]
        if reason not in seen and len(seen) < per_kind:
            seen.append(reason)
    return out


def by_id(items: list[QueueItem], ident: str) -> Any:
    return next((i for i in items if i.id == ident), None)
