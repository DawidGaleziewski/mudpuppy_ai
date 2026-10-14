"""Access read model (spec 024 US2): which personas reached each screen, the variant each one saw,
and which elements only some personas see. Read-only and deterministic; no migration.

The BA tool `get_access_matrix` (apps/crawler `services/ba/access.ts`) computes the same model;
both are checked against `apps/crawler/tests/fixtures/access/three-personas.json`.

- A persona's variant of a screen is the newest state of that screen it observed.
- Elements are a state's actions as `role "name"` keys (the role alone when unnamed).
- "Not seen by" counts only personas that reached the screen in a completed map run: a persona
  whose only visit was in an interrupted run has not shown that the element is missing.
- An element depends on access when some persona sees it and another does not; a screen does when
  any element does, or when a persona with a completed map run of the portal never reached it.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass


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


@dataclass(frozen=True)
class ScreenAccess:
    screen_id: str
    route: str
    title: str
    depends_on_access: bool
    variants: list[Variant]
    not_reached: list[str]  # personas with a completed map run of the portal that never got here
    elements_total: int
    elements: list[ElementAccess]  # the access-dependent ones only


@dataclass(frozen=True)
class AccessMatrix:
    portal_id: str
    personas: list[str]
    screens: list[ScreenAccess]


def element_key(role: str, name: str | None) -> str:
    return f'{role} "{name}"' if name else role


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
    rows: list[sqlite3.Row], keys: dict[str, set[str]], complete_personas: set[str]
) -> ScreenAccess:
    variants = _variants(rows)
    seen = {v.persona_id: keys.get(v.state_id, set()) for v in variants}
    counted = [v.persona_id for v in variants if v.complete_map_run]
    every_key = sorted(set().union(*seen.values()))
    elements = []
    for key in every_key:
        seen_by = [p for p in seen if key in seen[p]]
        not_seen_by = [p for p in counted if key not in seen[p]]
        if seen_by and not_seen_by:
            elements.append(ElementAccess(key, seen_by, not_seen_by))
    not_reached = sorted(complete_personas - seen.keys())
    first = rows[0]
    return ScreenAccess(
        screen_id=first["screen_id"],
        route=first["route_template"],
        title=first["title"],
        depends_on_access=bool(elements or not_reached),
        variants=variants,
        not_reached=not_reached,
        elements_total=len(every_key),
        elements=elements,
    )


def access_matrix(
    conn: sqlite3.Connection, portal: str, screen_id: str | None = None
) -> AccessMatrix:
    """The portal's access matrix, or one screen's row of it."""
    runs = conn.execute(
        "SELECT persona_id, MAX(status = 'completed' AND mode = 'map') AS complete "
        "FROM runs WHERE portal_id = ? GROUP BY persona_id ORDER BY persona_id",
        (portal,),
    ).fetchall()
    complete_personas = {r["persona_id"] for r in runs if r["complete"]}
    where, args = ("AND sc.id = ?", (portal, screen_id)) if screen_id else ("", (portal,))
    observations = conn.execute(
        f"""SELECT sc.id AS screen_id, sc.route_template, sc.title, o.persona_id, o.state_id,
                   o.run_id, o.observed_at, (r.status = 'completed' AND r.mode = 'map') AS complete
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
    return AccessMatrix(
        portal_id=portal,
        personas=[r["persona_id"] for r in runs],
        screens=[_screen(rows, keys, complete_personas) for rows in by_screen.values()],
    )
