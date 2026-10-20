"""Differing-states groups for Review (spec 033 FR-022, owner answer Q4 2026-10-17): the same
rules as the BA tool's `services/ba/differing-states.ts`, so Review lists every group, not only
the ones the BA proposed verdicts for. Both are checked against one fixture,
`apps/crawler/tests/fixtures/differing/differing-states.json` (the access-matrix precedent, spec
024); change them together.

- Action group `action:<screen>:<role>:<name>`: the same from-screen and action led to two or more
  screens; transitions a probe pressed are left out (their input explains them).
- Route group `route:<route>`: one route holds two or more screens whose states are no form step
  and of kind `main`; routes with a parameter are skipped.
- A screen merged into another (`screens.merged_into`, owner answer Q3) counts as that one.
Read-only.
"""

from __future__ import annotations

import sqlite3
from collections import Counter
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Scan:
    run_id: str
    persona: str
    environment: str
    started_at: str


@dataclass(frozen=True)
class GroupOutcome:
    screen_id: str
    state_id: str
    route: str
    title: str
    state_kind: str
    scans: list[Scan]
    first_seen: str
    last_seen: str
    http_status: int | None
    seen: int
    of: int
    reproduced: bool


@dataclass(frozen=True)
class Group:
    key: str
    kind: str
    route: str
    title: str
    action: tuple[str, str] | None  # (role, name)
    outcomes: list[GroupOutcome]


@dataclass(frozen=True)
class _Hit:
    group: str
    screen_id: str
    state_id: str
    run_id: str
    at: str
    transition_id: str | None


def _rows(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []


def _merged(conn: sqlite3.Connection, portal: str) -> dict[str, str]:
    """Screen → the screen it was merged into (none before migration 0026)."""
    rows = _rows(
        conn,
        "SELECT id, merged_into FROM screens WHERE portal_id = ? AND merged_into IS NOT NULL",
        (portal,),
    )
    return {r["id"]: r["merged_into"] for r in rows}


def _action_hits(conn: sqlite3.Connection, portal: str, merged: dict[str, str]) -> list[_Hit]:
    rows = _rows(
        conn,
        "SELECT f.screen_id AS frm, coalesce(json_extract(e.action_json, '$.role'), '') AS role,"
        " coalesce(json_extract(e.action_json, '$.accessible_name'), '') AS name,"
        " t.screen_id AS screen_id, e.to_state AS state_id, e.run_id, e.created_at AS at,"
        " e.id AS transition_id"
        " FROM transitions e JOIN states f ON f.id = e.from_state"
        " JOIN states t ON t.id = e.to_state"
        " WHERE f.portal_id = ? AND e.status = 'executed'"
        " AND f.screen_id IS NOT NULL AND t.screen_id IS NOT NULL AND t.screen_id <> f.screen_id"
        " AND NOT EXISTS (SELECT 1 FROM probe_outcomes p WHERE p.transition_id = e.id)"
        " ORDER BY e.created_at, e.id",
        (portal,),
    )
    hits = []
    for r in rows:
        frm, to = merged.get(r["frm"], r["frm"]), merged.get(r["screen_id"], r["screen_id"])
        if frm != to:
            group = f"action:{frm}:{r['role']}:{r['name']}"
            hits.append(_Hit(group, to, r["state_id"], r["run_id"], r["at"], r["transition_id"]))
    return hits


def _route_hits(conn: sqlite3.Connection, portal: str, merged: dict[str, str]) -> list[_Hit]:
    rows = _rows(
        conn,
        "SELECT s.route_template AS route, s.screen_id, s.id AS state_id, o.run_id,"
        " o.observed_at AS at FROM state_observations o JOIN states s ON s.id = o.state_id"
        " WHERE s.portal_id = ? AND s.screen_id IS NOT NULL AND s.form_step_id IS NULL"
        " AND coalesce(s.state_kind, 'main') = 'main' AND instr(s.route_template, ':') = 0"
        " ORDER BY o.observed_at, s.id",
        (portal,),
    )
    return [
        _Hit(
            f"route:{r['route']}",
            merged.get(r["screen_id"], r["screen_id"]),
            r["state_id"],
            r["run_id"],
            r["at"],
            None,
        )
        for r in rows
    ]


def _differing(hits: list[_Hit]) -> dict[str, list[_Hit]]:
    by: dict[str, list[_Hit]] = {}
    for h in hits:
        by.setdefault(h.group, []).append(h)
    return {k: hs for k, hs in by.items() if len({h.screen_id for h in hs}) > 1}


def _http(conn: sqlite3.Connection, transition_ids: list[str]) -> int | None:
    if not transition_ids:
        return None
    marks = ",".join("?" for _ in transition_ids)
    rows = _rows(
        conn,
        f"SELECT max(status) FROM network_calls WHERE transition_id IN ({marks})",
        tuple(transition_ids),
    )
    return rows[0][0] if rows else None


@dataclass(frozen=True)
class _Lookups:
    conn: sqlite3.Connection
    screens: dict[str, sqlite3.Row]
    runs: dict[str, Scan]
    kinds: dict[str, str]


def _outcomes(lk: _Lookups, hits: list[_Hit]) -> list[GroupOutcome]:
    taking = {h.run_id for h in hits}
    per: dict[str, list[_Hit]] = {}
    for h in hits:
        per.setdefault(h.screen_id, []).append(h)
    out = []
    for screen_id, hs in per.items():
        run_ids = list(dict.fromkeys(h.run_id for h in hs))
        state_id = Counter(h.state_id for h in hs).most_common(1)[0][0]
        screen = lk.screens.get(screen_id)
        out.append(
            GroupOutcome(
                screen_id=screen_id,
                state_id=state_id,
                route=screen["route_template"] if screen else "",
                title=screen["title"] if screen else "",
                state_kind=lk.kinds.get(state_id, "main"),
                scans=[lk.runs[r] for r in run_ids if r in lk.runs],
                first_seen=hs[0].at,
                last_seen=hs[-1].at,
                http_status=_http(lk.conn, [h.transition_id for h in hs if h.transition_id]),
                seen=len(run_ids),
                of=len(taking),
                reproduced=any(r != hs[0].run_id for r in run_ids),
            )
        )
    return out


def _lookups(conn: sqlite3.Connection, portal: str) -> _Lookups:
    screens = _rows(
        conn, "SELECT id, route_template, title FROM screens WHERE portal_id = ?", (portal,)
    )
    runs = _rows(
        conn,
        "SELECT id, persona_id, environment, started_at FROM runs WHERE portal_id = ?",
        (portal,),
    )
    kinds = _rows(
        conn,
        "SELECT id, coalesce(state_kind, 'main') AS kind FROM states WHERE portal_id = ?",
        (portal,),
    )
    return _Lookups(
        conn,
        {r["id"]: r for r in screens},
        {r["id"]: Scan(r["id"], r["persona_id"], r["environment"], r["started_at"]) for r in runs},
        {r["id"]: r["kind"] for r in kinds},
    )


def differing_groups(conn: sqlite3.Connection, portal: str) -> list[Group]:
    """Every current group of the portal, action groups first, as the BA tool lists them."""
    lk = _lookups(conn, portal)
    merged = _merged(conn, portal)
    groups = []
    for key, hs in _differing(_action_hits(conn, portal, merged)).items():
        _, frm, role, name = key.split(":", 3)
        screen = lk.screens.get(frm)
        groups.append(
            Group(
                key,
                "action",
                screen["route_template"] if screen else "",
                screen["title"] if screen else "",
                (role, name),
                _outcomes(lk, hs),
            )
        )
    for key, hs in _differing(_route_hits(conn, portal, merged)).items():
        groups.append(Group(key, "route", key.removeprefix("route:"), "", None, _outcomes(lk, hs)))
    return groups
