"""Read model of What changed (spec 039 T100, designer screen v2-02, UX-R10–R12, R14): the
deviations the reconciler found between model versions of a portal in a chosen range, grouped by
process and screen, each with its explanation in plain words (12-v2-ux.md § 3). Read-only.
Rules are on Rules and τ on Settings ▸ Screen identity now."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from typing import Any

# Kinds as the BA reads them (v2-02's kind chips); a broken rule is a failure.
KIND_WORDS = {
    "new_screen": "New screen",
    "new_member": "Variant",
    "new_action": "New action",
    "missing_action": "Removed",
    "target_mismatch": "Leads elsewhere",
    "result_mismatch": "Result changed",
    "rule_mismatch": "Rule broke",
}


@dataclass(frozen=True)
class Explanation:
    word: str  # the chip
    chip: str  # chip modifier: '' · 'fail' · 'tobe' (proposed) · 'dashed' (nothing found)
    text: str  # one sentence


# Hypothesis kind → explanation (v2-02's legend). `removed` depends on the rule's verdict.
EXPLAIN = {
    "structural_drift": Explanation(
        "Release", "", "The page changed when its portal part's release changed."
    ),
    "backend_drift": Explanation(
        "Backend changed", "", "Same front-end release; an endpoint's answer changed shape."
    ),
    "context_variant": Explanation("Another persona", "", "Only one persona or context sees it."),
    "ab_test": Explanation(
        "A/B test?", "tobe", "Proposed: a cookie splits visitors. Confirm or reject it."
    ),
    "flaky": Explanation("Flaky error", "", "An error seen once and gone when rechecked."),
    "nondeterministic": Explanation(
        "Unexplained", "dashed", "No difference found in release, persona, inputs or cookies."
    ),
    "deterministic_error": Explanation(
        "Error for one input", "", "An error that happens every time for one input."
    ),
    "replaces": Explanation("Replaced", "", "A new action took the old one's place."),
    "decision_point": Explanation(
        "Rule decides", "", "A business rule decides where it leads; it is mined from the cases."
    ),
    "decision_drift": Explanation("Rule changed", "", "A business rule now decides differently."),
}
RETIRED = Explanation("Retired", "", "Gone since a release. Kept and marked Retired.")
NO_RELEASE = Explanation("No release", "dashed", "Changed while the release stayed the same.")
PART_OF = Explanation("Part of a rename", "", "Another change's explanation covers it.")
NOTHING_YET = Explanation("Unexplained", "dashed", "No rule explained it yet.")
WAITING = Explanation("Being checked", "dashed", "Replays on the headless driver decide it.")

SHOW = ("all", "needs", "explained")


@dataclass(frozen=True)
class Change:
    id: str
    kind: str
    word: str
    status: str  # deviation vocabulary: open (needs you) · waiting_test · explained
    finding: str  # one sentence: the hypothesis's claim, or what the change is
    explanation: Explanation
    screen_key: str | None
    screen_title: str | None
    screen_route: str | None
    element_key: str | None
    hypothesis_key: str | None
    hypothesis_status: str | None
    reason: str | None
    rule: str | None
    model_seq: int
    created_at: str
    before: Any
    after: Any


@dataclass
class ScreenGroup:
    key: str | None
    title: str
    route: str | None
    changes: list[Change] = field(default_factory=list)

    @property
    def needs(self) -> int:
        return sum(c.status != "explained" for c in self.changes)


@dataclass
class ProcessGroup:
    key: str | None  # PRC-nnn; None = Not in a process
    name: str
    screens: list[ScreenGroup] = field(default_factory=list)

    @property
    def changes(self) -> list[Change]:
        return [c for s in self.screens for c in s.changes]


@dataclass(frozen=True)
class Version:
    seq: int
    built_at: str


@dataclass(frozen=True)
class ChangesView:
    portal: str | None
    latest_seq: int | None
    versions: list[Version] = field(default_factory=list)
    from_seq: int = 0
    to_seq: int | None = None
    show: str = "all"
    kind: str | None = None
    process: str | None = None
    groups: list[ProcessGroup] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)  # all · needs · explained · waiting
    legend: dict[str, int] = field(default_factory=dict)  # explanation word → changes in range
    processes: list[tuple[str, str, int]] = field(default_factory=list)  # key, name, changes

    def all_changes(self) -> list[Change]:
        return [c for g in self.groups for c in g.changes]


def rows_of(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []  # a store before migration 0031


CHANGE_SQL = (
    "SELECT d.id, d.kind, d.status, d.before_json, d.after_json, d.created_at, mv.seq,"
    "  s.key AS screen_key, s.title AS screen_title, s.route_key, a.element_key,"
    "  h.key AS hkey, h.kind AS hkind, h.claim, h.rule, h.derived,"
    "  (SELECT e.to_status FROM hypothesis_events e WHERE e.hypothesis_id = h.id"
    "     ORDER BY e.at DESC, e.id DESC LIMIT 1) AS hstatus,"
    "  (SELECT e.reason FROM hypothesis_events e WHERE e.hypothesis_id = h.id"
    "     ORDER BY e.at DESC, e.id DESC LIMIT 1) AS reason"
    " FROM deviations d JOIN model_versions mv ON mv.id = d.model_version_id"
    " LEFT JOIN model_screens s ON s.id = d.screen_id"
    " LEFT JOIN action_classes a ON a.id = d.action_class_id"
    " LEFT JOIN hypotheses h ON h.deviation_id = d.id"
)


def _status(r: sqlite3.Row) -> str:
    """Explained: a derived fact confirmed by its rule, or a deviation another one's fact covers
    (a rename's new button, explained by `replaces` on the old one: F-23@039)."""
    if (r["derived"] and r["hstatus"] == "confirmed") or (
        r["status"] == "explained" and r["hkey"] is None
    ):
        return "explained"
    return "waiting_test" if r["status"] == "waiting_test" else "open"


def _explanation(r: sqlite3.Row, status: str) -> Explanation:
    if r["hkind"] == "removed":
        return RETIRED if r["derived"] else NO_RELEASE
    if r["hkind"] in EXPLAIN:
        return EXPLAIN[r["hkind"]]
    if status == "explained":
        return PART_OF
    return WAITING if status == "waiting_test" else NOTHING_YET


def _finding(r: sqlite3.Row) -> str:
    if r["claim"]:
        return r["claim"]
    word = KIND_WORDS.get(r["kind"], r["kind"])
    what = f" {r['element_key']}" if r["element_key"] else ""
    where = f" on {r['screen_title']}" if r["screen_title"] else ""
    return f"{word}{what}{where}"


def change_of(r: sqlite3.Row) -> Change:
    status = _status(r)
    return Change(
        id=r["id"],
        kind=r["kind"],
        word=KIND_WORDS.get(r["kind"], r["kind"]),
        status=status,
        finding=_finding(r),
        explanation=_explanation(r, status),
        screen_key=r["screen_key"],
        screen_title=r["screen_title"],
        screen_route=r["route_key"],
        element_key=r["element_key"],
        hypothesis_key=r["hkey"],
        hypothesis_status=r["hstatus"],
        reason=r["reason"],
        rule=r["rule"],
        model_seq=r["seq"],
        created_at=r["created_at"],
        before=json.loads(r["before_json"]) if r["before_json"] else None,
        after=json.loads(r["after_json"]) if r["after_json"] else None,
    )


def process_of_screens(conn: sqlite3.Connection, portal: str) -> dict[str, tuple[str, str]]:
    """Model screen key → (PRC key, name) of the first process (by key) whose as-is walks it;
    archived processes are out of the BA's cut (spec 027)."""
    rows = rows_of(
        conn,
        "SELECT p.key, p.name, r.steps FROM ba_processes p JOIN process_models m"
        " ON m.process_id = p.id AND m.label = 'A' JOIN process_model_revisions r"
        " ON r.model_id = m.id AND r.rev = m.rev"
        " WHERE p.portal_id = ? AND p.archived_at IS NULL ORDER BY p.key",
        (portal,),
    )
    out: dict[str, tuple[str, str]] = {}
    for r in rows:
        states = [s["state_id"] for s in json.loads(r["steps"]) if s.get("state_id")]
        if not states:
            continue
        marks = ",".join("?" * len(states))
        for s in rows_of(
            conn,
            "SELECT DISTINCT ms.key FROM screen_members m JOIN model_screens ms"
            f" ON ms.id = m.screen_id WHERE m.to_model_version IS NULL AND m.state_id IN ({marks})",
            tuple(states),
        ):
            out.setdefault(s["key"], (r["key"], r["name"]))
    return out


ORDER = {"open": 0, "waiting_test": 1, "explained": 2}


def group(changes: list[Change], owners: dict[str, tuple[str, str]]) -> list[ProcessGroup]:
    """By process (in key order, Not in a process last), then screen; needs you first."""
    procs: dict[str | None, ProcessGroup] = {}
    for c in changes:
        key, name = owners.get(c.screen_key or "", (None, "Not in a process"))
        g = procs.setdefault(key, ProcessGroup(key, name))
        screen = next((s for s in g.screens if s.key == c.screen_key), None)
        if screen is None:
            title = c.screen_title or "Across the portal"
            screen = ScreenGroup(c.screen_key, title, c.screen_route)
            g.screens.append(screen)
        screen.changes.append(c)
    for g in procs.values():
        for s in g.screens:
            s.changes.sort(key=lambda c: ORDER[c.status])
        g.screens.sort(key=lambda s: (s.needs == 0, s.key or "~"))
    return sorted(procs.values(), key=lambda g: (g.key is None, g.key or ""))


def range_from(
    conn: sqlite3.Connection,
    portal: str | None,
    from_seq: int | None = None,
    from_date: str | None = None,
    from_scan: str | None = None,
) -> tuple[int, str]:
    """Changes' *from* (spec 040 FR-002, 12-v2-ux § 2) as the model version changes are counted
    after, and how it was chosen: a scan (the versions built before it started), a date or
    timestamp (built before it), a version, else the previous release (the newest version that
    brought a release, so its changes are in the range; none: from the first scan)."""
    if not portal:
        return 0, "first"
    before = "SELECT coalesce(max(seq), 0) FROM model_versions WHERE portal_id = ? AND built_at < ?"
    if from_scan:
        found = rows_of(conn, "SELECT started_at FROM runs WHERE id = ?", (from_scan,))
        if found:
            return int(rows_of(conn, before, (portal, found[0][0]))[0][0]), "scan"
    if from_date:
        return int(rows_of(conn, before, (portal, from_date))[0][0]), "date"
    if from_seq is not None:
        return max(from_seq, 0), "version"
    latest = rows_of(
        conn,
        "SELECT max(v.seq) FROM model_versions v WHERE v.portal_id = ?"
        " AND EXISTS (SELECT 1 FROM build_epochs e WHERE e.model_version_id = v.id)",
        (portal,),
    )
    seq = latest[0][0] if latest else None
    return (int(seq) - 1, "release") if seq else (0, "first")


@dataclass(frozen=True)
class ChangeFilter:
    """Which changes Changes lists: the version range and the show / kind / process filters."""

    from_seq: int = 0
    to_seq: int | None = None
    show: str = "all"
    kind: str | None = None
    process: str | None = None


ALL_CHANGES = ChangeFilter()


def changes_view(
    conn: sqlite3.Connection, portal: str | None, f: ChangeFilter = ALL_CHANGES
) -> ChangesView:
    """Changes first seen in model versions `from_seq` < seq ≤ `to_seq` (default: all)."""
    from_seq, to_seq, show, kind, process = f.from_seq, f.to_seq, f.show, f.kind, f.process
    if not portal:
        return ChangesView(None, None)
    versions = [
        Version(r["seq"], r["built_at"])
        for r in rows_of(
            conn,
            "SELECT seq, built_at FROM model_versions WHERE portal_id = ? ORDER BY seq",
            (portal,),
        )
    ]
    latest = versions[-1].seq if versions else None
    to = min(to_seq, latest) if to_seq is not None and latest is not None else latest
    rows = rows_of(
        conn,
        CHANGE_SQL + " WHERE d.portal_id = ? AND mv.seq > ? AND mv.seq <= ?"
        " ORDER BY mv.seq DESC, d.created_at DESC, d.id",
        (portal, from_seq, to or 0),
    )
    in_range = [change_of(r) for r in rows]
    owners = process_of_screens(conn, portal)
    every = group(in_range, owners)
    shown = [
        c
        for c in in_range
        if (show == "all" or (show == "needs") == (c.status != "explained"))
        and (kind is None or c.kind == kind)
        and (process is None or owners.get(c.screen_key or "", ("none",))[0] == process)
    ]
    legend: dict[str, int] = {}
    for c in in_range:
        legend[c.explanation.word] = legend.get(c.explanation.word, 0) + 1
    return ChangesView(
        portal=portal,
        latest_seq=latest,
        versions=versions,
        from_seq=from_seq,
        to_seq=to,
        show=show if show in SHOW else "all",
        kind=kind,
        process=process,
        groups=group(shown, owners),
        counts={
            "all": len(in_range),
            "needs": sum(c.status != "explained" for c in in_range),
            "explained": sum(c.status == "explained" for c in in_range),
            "waiting": sum(c.status == "waiting_test" for c in in_range),
        },
        legend=legend,
        processes=[(g.key or "none", g.name, len(g.changes)) for g in every],
    )
