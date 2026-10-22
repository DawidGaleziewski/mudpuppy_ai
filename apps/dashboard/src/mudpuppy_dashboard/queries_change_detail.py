"""Read model of one change's Before / after (spec 039 T100, designer screen v2-03, UX-R13): the
two recorded pages side by side, what differs between their contexts (release per portal part,
persona, scan, time), the explanation with its tests, and where the change shows. Read-only;
deciding stays in Review (and `pnpm model:decide`) until the decision bar lands."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from typing import Any

from .queries_changes import CHANGE_SQL, Change, change_of, process_of_screens, rows_of
from .queries_process_doc import Picture, pictures
from .queries_releases import part_name, release_name


@dataclass(frozen=True)
class Side:
    label: str
    note: str  # one line of what this side shows
    state_id: str | None = None
    title: str | None = None
    route: str | None = None
    picture: Picture | None = None
    run_id: str | None = None
    at: str | None = None
    persona: str | None = None
    releases: dict[str, str] = field(default_factory=dict)  # portal part → release
    layout_ref: str | None = None  # element boxes of the screenshot (the changed region)


@dataclass(frozen=True)
class Differ:
    label: str
    before: str
    after: str

    @property
    def differs(self) -> bool:
        return self.before != self.after


@dataclass(frozen=True)
class Test:
    inputs: str
    result: str | None
    verdict: str  # boundary_test vocabulary


@dataclass(frozen=True)
class ChangeDetail:
    change: Change
    process: tuple[str, str] | None
    before: Side
    after: Side
    differs: list[Differ]
    tests: list[Test]
    hypothesis_kind: str | None
    needs_ids: list[str]  # the range's changes that need you, for Previous / Next

    @property
    def position(self) -> int | None:
        ids = self.needs_ids
        return ids.index(self.change.id) + 1 if self.change.id in ids else None

    @property
    def marked_side(self) -> str | None:
        """The side whose page has the changed element (12-v2-ux § 6): the after side for a new
        or changed action, the before side for one that is gone; None without an element."""
        if not self.change.element_key:
            return None
        return "before" if self.change.kind == "missing_action" else "after"

    @property
    def decidable(self) -> bool:
        """The decision bar (v2-03): a hypothesis waiting for a person."""
        return bool(self.change.hypothesis_key) and self.change.status == "open"

    def neighbour(self, step: int) -> str | None:
        p = self.position
        if p is None:
            return None
        i = p - 1 + step
        return self.needs_ids[i] if 0 <= i < len(self.needs_ids) else None


def _members(conn: sqlite3.Connection, screen_key: str | None, portal: str) -> list[sqlite3.Row]:
    """The screen's current members (variants), oldest first."""
    if not screen_key:
        return []
    return rows_of(
        conn,
        "SELECT st.id, st.title, st.route_template FROM model_screens ms"
        " JOIN screen_members m ON m.screen_id = ms.id AND m.to_model_version IS NULL"
        " JOIN states st ON st.id = m.state_id"
        " WHERE ms.portal_id = ? AND ms.key = ? ORDER BY m.ordinal",
        (portal, screen_key),
    )


def _screen(conn: sqlite3.Connection, portal: str, ref: str) -> sqlite3.Row | None:
    rows = rows_of(
        conn,
        "SELECT key, title FROM model_screens WHERE portal_id = ? AND (id = ? OR key = ?)",
        (portal, ref, ref),
    )
    return rows[0] if rows else None


def _context(conn: sqlite3.Connection, state_id: str) -> dict[str, Any]:
    """The state's latest observation: scan, time, persona and the release of each part."""
    obs = rows_of(
        conn,
        "SELECT o.id, o.run_id, o.created_at, r.persona_id FROM observations o"
        " JOIN runs r ON r.id = o.run_id WHERE o.state_id = ?"
        " ORDER BY o.created_at DESC, o.id DESC LIMIT 1",
        (state_id,),
    )
    if not obs:
        return {}
    builds = rows_of(
        conn,
        "SELECT b.scope, b.signature FROM observation_builds ob JOIN builds b"
        " ON b.id = ob.build_id WHERE ob.observation_id = ? ORDER BY b.scope",
        (obs[0]["id"],),
    )
    return {
        "run_id": obs[0]["run_id"],
        "at": obs[0]["created_at"],
        "persona": obs[0]["persona_id"],
        "releases": {part_name(b["scope"]): release_name(b["signature"]) for b in builds},
    }


def side_of(conn: sqlite3.Connection, label: str, note: str, state: sqlite3.Row | None) -> Side:
    if state is None:
        return Side(label, note)
    pic = pictures(conn, [state["id"]]).get(state["id"])
    layout = rows_of(conn, "SELECT layout_ref FROM states WHERE id = ?", (state["id"],))
    return Side(
        label,
        note,
        state["id"],
        state["title"],
        state["route_template"],
        pic,
        **_context(conn, state["id"]),
        layout_ref=layout[0]["layout_ref"] if layout else None,
    )


def _target(conn: sqlite3.Connection, portal: str, t: Any) -> str:
    if not isinstance(t, dict):
        return "—"
    s = _screen(conn, portal, str(t.get("toScreen", "")))
    where = f"{s['key']} {s['title']}" if s else str(t.get("toScreen", "?"))
    return f"{where} · {t.get('result', '?')}"


def _notes(conn: sqlite3.Connection, portal: str, c: Change) -> tuple[str, str]:
    """What each side shows, for the kinds that compare the screen's oldest and newest variant."""
    if c.kind in ("target_mismatch", "result_mismatch", "rule_mismatch"):
        before = _target(conn, portal, c.before)
        return f"Led to {before}", f"Leads to {_target(conn, portal, c.after)}"
    el = c.element_key or "the action"
    if c.kind == "missing_action":
        return f"{el} was on the screen.", f"{el} is gone."
    return f"{el} was not on the screen.", f"{el} is new."


def _sides(
    conn: sqlite3.Connection, portal: str, c: Change, state_id: str | None
) -> tuple[Side, Side]:
    members = _members(conn, c.screen_key, portal)
    newest = members[-1] if members else None
    oldest = members[0] if members else None
    if c.kind == "new_screen":
        return Side("Before", "No such screen yet."), side_of(
            conn, "After", "The new screen.", oldest
        )
    if c.kind == "new_member":
        new = next((m for m in members if m["id"] == state_id), newest)
        old = next((m for m in members if m["id"] != state_id), None)
        return (
            side_of(conn, "Known variant", "How the screen looked before.", old),
            side_of(conn, "New variant", "The way it looks now.", new),
        )
    before, after = _notes(conn, portal, c)
    return side_of(conn, "Before", before, oldest), side_of(conn, "After", after, newest)


def differs_of(before: Side, after: Side) -> list[Differ]:
    if before.state_id is None or after.state_id is None:
        return []
    parts = sorted(set(before.releases) | set(after.releases))
    return [
        *(
            Differ(f"Release · {p}", before.releases.get(p, "—"), after.releases.get(p, "—"))
            for p in parts
        ),
        Differ("Persona", before.persona or "—", after.persona or "—"),
        Differ("Scan", before.run_id or "—", after.run_id or "—"),
    ]


def _tests(conn: sqlite3.Connection, hypothesis_key: str | None, portal: str) -> list[Test]:
    if not hypothesis_key:
        return []
    return [
        Test(
            ", ".join(f"{k} = {v}" for k, v in json.loads(r["inputs_json"]).items())
            or "as recorded",
            json.loads(r["result_json"]).get("outcome") if r["result_json"] else None,
            r["verdict"] or "waiting",
        )
        for r in rows_of(
            conn,
            "SELECT t.inputs_json, t.result_json, t.verdict FROM hypothesis_tests t"
            " JOIN hypotheses h ON h.id = t.hypothesis_id WHERE h.portal_id = ? AND h.key = ?"
            " ORDER BY t.created_at, t.id",
            (portal, hypothesis_key),
        )
    ]


def change_detail(conn: sqlite3.Connection, portal: str, deviation_id: str) -> ChangeDetail | None:
    rows = rows_of(conn, CHANGE_SQL + " WHERE d.portal_id = ? AND d.id = ?", (portal, deviation_id))
    if not rows:
        return None
    c = change_of(rows[0])
    state = rows_of(
        conn,
        "SELECT state_id, (SELECT kind FROM hypotheses WHERE deviation_id = d.id) AS hkind"
        " FROM deviations d WHERE d.id = ?",
        (deviation_id,),
    )
    before, after = _sides(conn, portal, c, state[0]["state_id"])
    every = rows_of(
        conn,
        CHANGE_SQL + " WHERE d.portal_id = ? ORDER BY mv.seq DESC, d.created_at DESC, d.id",
        (portal,),
    )
    needs = [x.id for x in map(change_of, every) if x.status != "explained"]
    return ChangeDetail(
        change=c,
        process=process_of_screens(conn, portal).get(c.screen_key or ""),
        before=before,
        after=after,
        differs=differs_of(before, after),
        tests=_tests(conn, c.hypothesis_key, portal),
        hypothesis_kind=state[0]["hkind"],
        needs_ids=needs,
    )
