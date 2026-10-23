"""Access read model (spec 024 US2, US3.4): which personas reached each screen, the variant each one
saw, which elements only some personas see, and which BA records explain those differences.
Read-only and deterministic; no migration.

The BA tool `get_access_matrix` (apps/crawler `services/ba/access.ts`) computes the same model;
both are checked against `apps/crawler/tests/fixtures/access/three-personas.json`.

- A persona's variant of a screen is the newest state of that screen it observed.
- Elements are a state's actions as `role "name"` keys (the role alone when unnamed).
- "Not seen by" counts only personas that reached the screen in a completed map run: a persona
  whose only visit was in an interrupted run has not shown that the element is missing.
- An element depends on access when some persona sees it and another does not; a screen does when
  any element does, or when a persona with a completed map run of the portal never reached it.
- Explained (plan P2 E), from the latest revision of a record that is not withdrawn: an element by
  a business rule citing the element's screen region on a seer's variant and a state or region on
  a non-seer's variant; a screen's "not reached" by a business rule or open question citing a
  state of the screen and a state an unreaching persona observed.
"""

from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Variant:
    persona_id: str
    state_id: str
    run_id: str
    observed_at: str
    complete_map_run: bool  # reached the screen in a completed map run


@dataclass(frozen=True)
class ElementAccess:
    key: str
    seen_by: list[str]
    not_seen_by: list[str]
    explained_by: list[str]  # record keys, sorted


@dataclass(frozen=True)
class ScreenAccess:
    screen_id: str
    route: str
    title: str
    depends_on_access: bool
    variants: list[Variant]
    not_reached: list[str]  # personas with a completed map run of the portal that never got here
    reach_explained_by: list[str]  # record keys; empty when nothing is unreached
    elements_total: int
    elements: list[ElementAccess]  # the access-dependent ones only


@dataclass(frozen=True)
class AccessMatrix:
    portal_id: str
    personas: list[str]
    screens: list[ScreenAccess]
    # R-33 F-03 (spec 046): personas mapped only by runs that ran out of steps, never "not reached"
    budget_limited: list[str] = field(default_factory=list)


def _full_scan(t: str) -> str:
    """A completed map run that stopped before its step budget (spec 024 edge cases, R-33 F-03):
    only full scans count as evidence that a persona does not get somewhere or see something."""
    return (
        f"({t}.status = 'completed' AND {t}.mode = 'map' AND {t}.steps_used < "
        f"coalesce(json_extract({t}.config_snapshot, '$.portal.scope.max_steps'), 1e9))"
    )


@dataclass
class _Cited:
    """What one record's latest revision cites: states, and (state, element key) regions."""

    kind: str
    states: set[str] = field(default_factory=set)
    regions: set[tuple[str, str]] = field(default_factory=set)


@dataclass(frozen=True)
class _Evidence:
    cited: dict[str, _Cited]  # record key → citations
    observed: dict[str, set[str]]  # persona → states it observed


def element_key(role: str, name: str | None) -> str:
    return f'{role} "{name}"' if name else role


def _region_base(region: str) -> str:
    """A region key without its `#n` suffix (the second `button "Export"` is `…"Export"#2`)."""
    return re.sub(r"#\d+$", "", region)


def _evidence(conn: sqlite3.Connection, portal: str) -> _Evidence:
    cited: dict[str, _Cited] = {}
    try:
        links = conn.execute(
            """SELECT r.key, r.kind, l.target_id, l.region FROM doc_records r
               JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev
               JOIN doc_evidence l ON l.revision_id = v.id
                AND l.target_kind IN ('state', 'screen_region')
               WHERE r.portal_id = ? AND r.withdrawn = 0
                 AND r.kind IN ('business_rule', 'open_question')""",
            (portal,),
        ).fetchall()
    except sqlite3.OperationalError:  # a store before the documentation tables
        links = []
    for x in links:
        c = cited.setdefault(x["key"], _Cited(x["kind"]))
        c.states.add(x["target_id"])
        if x["region"]:
            c.regions.add((x["target_id"], _region_base(x["region"])))
    observed: dict[str, set[str]] = {}
    for o in conn.execute(
        "SELECT DISTINCT o.persona_id, o.state_id FROM state_observations o"
        " JOIN states s ON s.id = o.state_id WHERE s.portal_id = ?",
        (portal,),
    ):
        observed.setdefault(o["persona_id"], set()).add(o["state_id"])
    return _Evidence(cited, observed)


def _explaining_element(ev: _Evidence, key: str, seers: set[str], others: set[str]) -> list[str]:
    return sorted(
        k
        for k, c in ev.cited.items()
        if c.kind == "business_rule"
        and any((s, key) in c.regions for s in seers)
        and c.states & others
    )


def _explaining_reach(ev: _Evidence, screen_states: set[str], not_reached: list[str]) -> list[str]:
    if not not_reached:
        return []
    elsewhere = set().union(*(ev.observed.get(p, set()) for p in not_reached))
    return sorted(
        k for k, c in ev.cited.items() if c.states & screen_states and c.states & elsewhere
    )


def _variants(rows: list[sqlite3.Row]) -> list[Variant]:
    """Rows of one screen, oldest first: the newest per persona, flagged when any was complete."""
    newest: dict[str, sqlite3.Row] = {}
    complete: set[str] = set()
    for r in rows:
        newest[r["persona_id"]] = r
        if r["complete"]:
            complete.add(r["persona_id"])
    return [
        Variant(p, r["state_id"], r["run_id"], r["observed_at"], p in complete)
        for p, r in sorted(newest.items())
    ]


def _screen(
    rows: list[sqlite3.Row], keys: dict[str, set[str]], complete_personas: set[str], ev: _Evidence
) -> ScreenAccess:
    variants = _variants(rows)
    state_of = {v.persona_id: v.state_id for v in variants}
    seen = {p: keys.get(s, set()) for p, s in state_of.items()}
    counted = [v.persona_id for v in variants if v.complete_map_run]
    every_key = sorted(set().union(*seen.values()))
    elements = []
    for key in every_key:
        seen_by = [p for p in seen if key in seen[p]]
        not_seen_by = [p for p in counted if key not in seen[p]]
        if seen_by and not_seen_by:
            seers = {state_of[p] for p in seen_by}
            others = {state_of[p] for p in not_seen_by}
            explained = _explaining_element(ev, key, seers, others)
            elements.append(ElementAccess(key, seen_by, not_seen_by, explained))
    not_reached = sorted(complete_personas - seen.keys())
    first = rows[0]
    return ScreenAccess(
        screen_id=first["screen_id"],
        route=first["route_template"],
        title=first["title"],
        depends_on_access=bool(elements or not_reached),
        variants=variants,
        not_reached=not_reached,
        reach_explained_by=_explaining_reach(ev, {r["state_id"] for r in rows}, not_reached),
        elements_total=len(every_key),
        elements=elements,
    )


def access_matrix(
    conn: sqlite3.Connection, portal: str, screen_id: str | None = None
) -> AccessMatrix:
    """The portal's access matrix, or one screen's row of it."""
    runs = conn.execute(
        f"SELECT persona_id, MAX({_full_scan('runs')}) AS complete, "
        "MAX(status = 'completed' AND mode = 'map') AS mapped "
        "FROM runs WHERE portal_id = ? GROUP BY persona_id ORDER BY persona_id",
        (portal,),
    ).fetchall()
    complete_personas = {r["persona_id"] for r in runs if r["complete"]}
    where, args = ("AND sc.id = ?", (portal, screen_id)) if screen_id else ("", (portal,))
    observations = conn.execute(
        f"""SELECT sc.id AS screen_id, sc.route_template, sc.title, o.persona_id, o.state_id,
                   o.run_id, o.observed_at, {_full_scan('r')} AS complete
            FROM state_observations o
            JOIN states s ON s.id = o.state_id
            JOIN screens sc ON sc.id = s.screen_id
            JOIN runs r ON r.id = o.run_id
            WHERE sc.portal_id = ? {where}
            ORDER BY sc.route_template, sc.title, sc.id, o.observed_at, o.run_id""",
        args,
    ).fetchall()
    # Only the actions of the screens asked for: the screen page calls this for one screen.
    keys: dict[str, set[str]] = {}
    state_where = "AND s.screen_id = ?" if screen_id else "AND s.screen_id IS NOT NULL"
    for a in conn.execute(
        f"""SELECT DISTINCT a.state_id, a.role, a.accessible_name FROM actions a
            JOIN states s ON s.id = a.state_id WHERE s.portal_id = ? {state_where}""",
        args,
    ):
        keys.setdefault(a["state_id"], set()).add(element_key(a["role"], a["accessible_name"]))
    by_screen: dict[str, list[sqlite3.Row]] = {}
    for o in observations:
        by_screen.setdefault(o["screen_id"], []).append(o)
    ev = _evidence(conn, portal)
    return AccessMatrix(
        portal_id=portal,
        personas=[r["persona_id"] for r in runs],
        budget_limited=[r["persona_id"] for r in runs if r["mapped"] and not r["complete"]],
        screens=[_screen(rows, keys, complete_personas, ev) for rows in by_screen.values()],
    )


@dataclass(frozen=True)
class Difference:
    """One open item for Review (plan P2 F): an element only some personas see, or (element
    None) the personas that never reached the screen."""

    screen: ScreenAccess
    element: ElementAccess | None

    @property
    def id(self) -> str:
        return f"{self.screen.screen_id}|{self.element.key if self.element else ''}"


def unexplained(matrix: AccessMatrix) -> list[Difference]:
    """Differences no BA record explains yet, screen by screen (reach first, then elements)."""
    out: list[Difference] = []
    for s in matrix.screens:
        if s.not_reached and not s.reach_explained_by:
            out.append(Difference(s, None))
        out.extend(Difference(s, e) for e in s.elements if not e.explained_by)
    return out


@dataclass(frozen=True)
class TextDiffers:
    left: str
    right: str


@dataclass(frozen=True)
class VariantDiff:
    """Two variants side by side (plan P2 G): what only one shows, what is the same element with
    other text (the same role at the same place among that role's elements, F-02), and how many
    are the same."""

    only_left: list[str]
    only_right: list[str]
    text_differs: list[TextDiffers]
    same: int


def screenshots(conn: sqlite3.Connection, state_ids: list[str]) -> dict[str, str | None]:
    """state id → its screenshot evidence ref (None when the state has none)."""
    marks = ", ".join("?" for _ in state_ids)
    rows = conn.execute(
        f"SELECT id, screenshot_ref FROM states WHERE id IN ({marks})", tuple(state_ids)
    )
    return {r["id"]: r["screenshot_ref"] for r in rows}


def _elements_in_order(conn: sqlite3.Connection, state_id: str) -> list[tuple[str, str]]:
    """(role, key) of a state's actions in recorded order, each key once."""
    out: dict[str, str] = {}
    for a in conn.execute(
        "SELECT role, accessible_name FROM actions WHERE state_id = ? ORDER BY created_at, rowid",
        (state_id,),
    ):
        out.setdefault(element_key(a["role"], a["accessible_name"]), a["role"])
    return [(role, key) for key, role in out.items()]


def variant_diff(conn: sqlite3.Connection, left_state: str, right_state: str) -> VariantDiff:
    left, right = _elements_in_order(conn, left_state), _elements_in_order(conn, right_state)
    left_keys, right_keys = {k for _, k in left}, {k for _, k in right}
    by_role: dict[str, tuple[list[str], list[str]]] = {}
    for side, elements in ((0, left), (1, right)):
        for role, key in elements:
            by_role.setdefault(role, ([], []))[side].append(key)
    paired: list[TextDiffers] = []
    for lk, rk in by_role.values():
        for a, b in zip(lk, rk, strict=False):
            if a not in right_keys and b not in left_keys:
                paired.append(TextDiffers(a, b))
    in_pairs = {p.left for p in paired} | {p.right for p in paired}
    return VariantDiff(
        only_left=[k for _, k in left if k not in right_keys and k not in in_pairs],
        only_right=[k for _, k in right if k not in left_keys and k not in in_pairs],
        text_differs=paired,
        same=len(left_keys & right_keys),
    )
