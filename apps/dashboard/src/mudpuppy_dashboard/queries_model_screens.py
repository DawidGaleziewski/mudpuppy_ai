"""Screens of the portal model (spec 039 T100, designer screens v2-06 / v2-07, UX-R30–R33): every
screen with its status (retired ones are kept, owner answer OV-3), its variants and why each
differs, when it was last seen, how many of its actions were checked, its portal part and process;
and one screen's page: what needs a person on it, its variants, actions and history. Read-only."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from typing import Any

from .queries_changes import CHANGE_SQL, Change, Explanation, change_of, process_of_screens, rows_of
from .queries_process_doc import Picture, pictures
from .queries_queue import QueueItem, findings_rules_removals
from .queries_releases import part_name, release_name

BASELINE = Explanation("Baseline", "", "The first way the screen was seen.")
STATUS_ORDER = {"active": 0, "merged": 1, "retired": 2}
# A variant's why in the designer's six words (spec 040 FR-008, 12-v2-ux § 3) from the
# explanation of the change that brought it; anything else is Unknown.
WHY = ("Release", "Persona", "Error", "A/B test", "Data", "Unknown")
WHY_OF = {
    "Release": "Release",
    "Backend changed": "Release",
    "Another persona": "Persona",
    "A/B test?": "A/B test",
    "Flaky error": "Error",
    "Error for one input": "Error",
    "Rule decides": "Data",
    "Rule changed": "Data",
}
SORTS = {
    "needs": "Needs you first",
    "key": "Key",
    "seen": "Last seen",
    "variants": "Most variants",
    "checked": "Least checked",
}


def why_of(e: Explanation) -> str:
    return WHY_OF.get(e.word, "Unknown")


@dataclass(frozen=True)
class ScreenRow:
    key: str
    title: str
    route: str
    status: str
    variants: int
    why: list[str]  # the distinct whys of its variants (WHY), baseline left out
    last_seen: str | None
    last_run: str | None
    checked: int  # actions seen working
    actions: int  # actions, retired left out
    parts: list[str]
    process: tuple[str, str] | None
    needs: int  # changes on it that need a person
    release: str | None = None  # the release it was last seen on ("checked 8 / 11 on 9c21")


@dataclass(frozen=True)
class Variant:
    ordinal: int
    state_id: str
    title: str
    picture: Picture | None
    why: Explanation
    status: str | None  # deviation vocabulary of the change that brought it; None: baseline
    first_seen: str | None
    last_seen: str | None
    visits: int
    personas: list[str]
    releases: list[str]

    @property
    def reason(self) -> str:
        """The why with what it names (designer: "r3 · Persona premium")."""
        if self.why is BASELINE:
            return "Baseline"
        word = why_of(self.why)
        detail = {"Release": self.releases[-1:], "Persona": self.personas}.get(word, [])
        return " ".join([word, ", ".join(detail)]).strip()


@dataclass(frozen=True)
class Action:
    element_key: str
    kind: str
    status: str
    is_global: bool
    leads_to: list[tuple[str | None, str | None, str]]  # (screen key, title, result)


@dataclass(frozen=True)
class ScreenDetail:
    row: ScreenRow
    needs: list[tuple[str, QueueItem]]
    variants: list[Variant]
    actions: list[Action]
    history: list[Change] = field(default_factory=list)


SCREEN_SQL = (
    "SELECT s.id, s.key, s.title, s.route_key, s.status,"
    "  (SELECT count(*) FROM screen_members m WHERE m.screen_id = s.id"
    "     AND m.to_model_version IS NULL) AS variants,"
    "  (SELECT max(o.created_at) FROM observations o JOIN screen_members m"
    "     ON m.state_id = o.state_id WHERE m.screen_id = s.id) AS last_seen,"
    "  (SELECT o.run_id FROM observations o JOIN screen_members m ON m.state_id = o.state_id"
    "     WHERE m.screen_id = s.id ORDER BY o.created_at DESC LIMIT 1) AS last_run,"
    "  (SELECT count(*) FROM action_classes a WHERE a.screen_id = s.id"
    "     AND a.status = 'active') AS checked,"
    "  (SELECT count(*) FROM action_classes a WHERE a.screen_id = s.id"
    "     AND a.status <> 'retired') AS actions"
    " FROM model_screens s WHERE s.portal_id = ?"
)


def _parts(conn: sqlite3.Connection, screen_id: str) -> list[str]:
    rows = rows_of(
        conn,
        "SELECT DISTINCT b.scope FROM screen_members m"
        " JOIN observations o ON o.state_id = m.state_id"
        " JOIN observation_builds ob ON ob.observation_id = o.id"
        " JOIN builds b ON b.id = ob.build_id WHERE m.screen_id = ? ORDER BY b.scope",
        (screen_id,),
    )
    return [part_name(r["scope"]) for r in rows]


def _changes_by_screen(conn: sqlite3.Connection, portal: str) -> dict[str, list[Change]]:
    out: dict[str, list[Change]] = {}
    sql = CHANGE_SQL + " WHERE d.portal_id = ? ORDER BY d.created_at DESC"
    for r in rows_of(conn, sql, (portal,)):
        c = change_of(r)
        if c.screen_key:
            out.setdefault(c.screen_key, []).append(c)
    return out


def _why(changes: list[Change]) -> list[str]:
    seen = {why_of(c.explanation) for c in changes if c.kind == "new_member"}
    return [w for w in WHY if w in seen]


def _release(conn: sqlite3.Connection, screen_id: str) -> str | None:
    """The release of the last observation of the screen that names one."""
    rows = rows_of(
        conn,
        "SELECT b.signature FROM screen_members m JOIN observations o ON o.state_id = m.state_id"
        " JOIN observation_builds ob ON ob.observation_id = o.id"
        " JOIN builds b ON b.id = ob.build_id WHERE m.screen_id = ?"
        " ORDER BY o.created_at DESC, b.scope <> 'shell' DESC LIMIT 1",
        (screen_id,),
    )
    return release_name(rows[0]["signature"]) if rows else None


def _row(
    conn: sqlite3.Connection,
    r: sqlite3.Row,
    changes: list[Change],
    owners: dict[str, tuple[str, str]],
) -> ScreenRow:
    return ScreenRow(
        key=r["key"],
        title=r["title"],
        route=r["route_key"],
        status=r["status"],
        variants=r["variants"],
        why=_why(changes),
        last_seen=r["last_seen"],
        last_run=r["last_run"],
        checked=r["checked"],
        actions=r["actions"],
        parts=_parts(conn, r["id"]),
        process=owners.get(r["key"]),
        needs=sum(c.status != "explained" for c in changes),
        release=_release(conn, r["id"]),
    )


@dataclass(frozen=True)
class Coverage:
    """ "Checked 8 / 11 on 9c21" (spec 040 FR-009): actions seen working over actions not
    retired, on the release the screens were last seen on."""

    checked: int
    actions: int
    release: str | None


def coverage(conn: sqlite3.Connection, portal: str, keys: set[str]) -> Coverage:
    """The coverage of the model screens `keys` together (a process's screens)."""
    if not keys:
        return Coverage(0, 0, None)
    marks = ",".join("?" * len(keys))
    rows = rows_of(
        conn,
        "SELECT s.id, (SELECT count(*) FROM action_classes a WHERE a.screen_id = s.id"
        "  AND a.status = 'active') AS checked, (SELECT count(*) FROM action_classes a"
        "  WHERE a.screen_id = s.id AND a.status <> 'retired') AS actions,"
        "  (SELECT max(o.created_at) FROM screen_members m JOIN observations o"
        "   ON o.state_id = m.state_id WHERE m.screen_id = s.id) AS seen"
        f" FROM model_screens s WHERE s.portal_id = ? AND s.key IN ({marks})",
        (portal, *sorted(keys)),
    )
    latest = max(rows, key=lambda r: r["seen"] or "", default=None)
    return Coverage(
        sum(r["checked"] for r in rows),
        sum(r["actions"] for r in rows),
        _release(conn, latest["id"]) if latest else None,
    )


@dataclass(frozen=True)
class ScreenFilter:
    """The list's filters (spec 039 F-51): status, text, process, portal part, a why, the sort."""

    status: str | None = None
    q: str = ""
    process: str | None = None
    part: str | None = None
    why: str | None = None  # one of WHY: screens with a variant of that why
    sort: str = "needs"

    def keeps(self, r: ScreenRow) -> bool:
        return (
            (not self.process or (r.process[0] if r.process else "none") == self.process)
            and (not self.part or self.part in r.parts)
            and (not self.why or self.why in r.why)
        )


def _sort_key(sort: str) -> Any:
    return {
        "key": lambda r: r.key,
        "seen": lambda r: ("" if r.last_seen is None else r.last_seen, r.key),
        "variants": lambda r: (-r.variants, r.key),
        "checked": lambda r: (r.checked / r.actions if r.actions else 2.0, r.key),
    }.get(sort, lambda r: (r.needs == 0, STATUS_ORDER.get(r.status, 3), r.key))


def model_screens(
    conn: sqlite3.Connection, portal: str, f: ScreenFilter | None = None
) -> list[ScreenRow]:
    """Needs you first, then active, merged and retired; by key within each (or `f.sort`).
    `f.q` matches the key, title or route."""
    f = f or ScreenFilter()
    owners = process_of_screens(conn, portal)
    by_screen = _changes_by_screen(conn, portal)
    needle = f.q.lower()
    rows = [
        _row(conn, r, by_screen.get(r["key"], []), owners)
        for r in rows_of(conn, SCREEN_SQL + " ORDER BY s.key", (portal,))
        if (f.status is None or r["status"] == f.status)
        and needle in f"{r['key']} {r['title']} {r['route_key']}".lower()
    ]
    rows = [r for r in rows if f.keeps(r)]
    return sorted(rows, key=_sort_key(f.sort), reverse=f.sort == "seen")


def status_counts(conn: sqlite3.Connection, portal: str) -> dict[str, int]:
    return {
        r["status"]: r["n"]
        for r in rows_of(
            conn,
            "SELECT status, count(*) AS n FROM model_screens WHERE portal_id = ? GROUP BY status",
            (portal,),
        )
    }


def _variants(conn: sqlite3.Connection, screen_id: str, changes: list[Change]) -> list[Variant]:
    members = rows_of(
        conn,
        "SELECT m.ordinal, st.id, st.title,"
        "  (SELECT min(o.created_at) FROM observations o WHERE o.state_id = st.id) AS first_seen,"
        "  (SELECT max(o.created_at) FROM observations o WHERE o.state_id = st.id) AS last_seen,"
        "  (SELECT count(*) FROM observations o WHERE o.state_id = st.id) AS visits"
        " FROM screen_members m JOIN states st ON st.id = m.state_id"
        " WHERE m.screen_id = ? AND m.to_model_version IS NULL ORDER BY m.ordinal",
        (screen_id,),
    )
    pics = pictures(conn, [m["id"] for m in members])
    states = rows_of(
        conn,
        "SELECT id, state_id FROM deviations WHERE kind = 'new_member' AND screen_id = ?",
        (screen_id,),
    )
    by_state = {s["state_id"]: s["id"] for s in states}
    by_id = {c.id: c for c in changes}
    out = []
    for m in members:
        change = by_id.get(by_state.get(m["id"], ""))
        ctx = rows_of(
            conn,
            "SELECT DISTINCT r.persona_id, b.signature FROM observations o JOIN runs r"
            " ON r.id = o.run_id LEFT JOIN observation_builds ob ON ob.observation_id = o.id"
            " LEFT JOIN builds b ON b.id = ob.build_id WHERE o.state_id = ?",
            (m["id"],),
        )
        out.append(
            Variant(
                ordinal=m["ordinal"],
                state_id=m["id"],
                title=m["title"],
                picture=pics.get(m["id"]),
                why=change.explanation if change else BASELINE,
                status=change.status if change else None,
                first_seen=m["first_seen"],
                last_seen=m["last_seen"],
                visits=m["visits"],
                personas=sorted({c["persona_id"] for c in ctx}),
                releases=sorted({release_name(c["signature"]) for c in ctx if c["signature"]}),
            )
        )
    return out


def _actions(conn: sqlite3.Connection, screen_id: str) -> list[Action]:
    classes = rows_of(
        conn,
        "SELECT id, element_key, kind, status, is_global FROM action_classes WHERE screen_id = ?"
        " ORDER BY status = 'retired', is_global, element_key",
        (screen_id,),
    )
    out = []
    for a in classes:
        leads = rows_of(
            conn,
            "SELECT s.key, s.title, t.result FROM model_transitions t"
            " LEFT JOIN model_screens s ON s.id = t.to_screen_id WHERE t.action_class_id = ?"
            " ORDER BY t.support DESC",
            (a["id"],),
        )
        targets = [(r["key"], r["title"], r["result"]) for r in leads]
        out.append(Action(a["element_key"], a["kind"], a["status"], bool(a["is_global"]), targets))
    return out


def screen_detail(conn: sqlite3.Connection, portal: str, key: str) -> ScreenDetail | None:
    rows = rows_of(conn, SCREEN_SQL + " AND s.key = ?", (portal, key))
    if not rows:
        return None
    changes = _changes_by_screen(conn, portal).get(key, [])
    findings, rules, removals = findings_rules_removals(conn, portal)
    ids = {c.id for c in changes}
    needs = [
        (kind, i)
        for kind, items in (("rules", rules), ("findings", findings), ("removals", removals))
        for i in items
        if i.id in ids or i.where == key
    ]
    return ScreenDetail(
        row=_row(conn, rows[0], changes, process_of_screens(conn, portal)),
        needs=needs,
        variants=_variants(conn, rows[0]["id"], changes),
        actions=_actions(conn, rows[0]["id"]),
        history=changes,
    )
