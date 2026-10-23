"""The React console's smaller lists (R-100, spec 071), as typed JSON over their read models:
Access by persona (spec 024 US2), Server activity (FR-016), Search, and Scans by process
(spec 034 R-70 (1)). Statuses come mapped."""

from __future__ import annotations

import sqlite3

from pydantic import BaseModel

from . import queries, queries_access, queries_run_groups, queries_screens
from .queries_app import StatusOut, status_out

# --- Access by persona ----------------------------------------------------------------------


class AccessCell(BaseModel):
    state: str
    #: Reached only in an interrupted or trace run: not counted as "not shown".
    complete: bool


class AccessRow(BaseModel):
    title: str
    route: str
    #: The recording its title opens.
    open: str | None
    cells: list[AccessCell | None]
    differ: int
    total: int
    status: StatusOut


class AccessPage(BaseModel):
    portal: str
    personas: list[tuple[str, str | None]]
    rows: list[AccessRow]
    #: Personas mapped only by runs that ran out of steps: never "not reached" (R-33 F-03).
    budget_limited: list[str]


def access_page(conn: sqlite3.Connection, portal: str, attrs: dict[str, str]) -> AccessPage:
    m = queries_access.access_matrix(conn, portal)
    rows = []
    for s in m.screens:
        by = {v.persona_id: v for v in s.variants}
        rows.append(
            AccessRow(
                title=s.title or "(untitled page)",
                route=s.route,
                open=s.variants[0].state_id if s.variants else None,
                cells=[
                    AccessCell(state=by[p].state_id, complete=by[p].complete_map_run)
                    if p in by
                    else None
                    for p in m.personas
                ],
                differ=len(s.elements),
                total=s.elements_total,
                status=status_out("access", "depends" if s.depends_on_access else "same"),
            )
        )
    return AccessPage(
        portal=portal,
        personas=[(p, attrs.get(p)) for p in m.personas],
        rows=rows,
        budget_limited=m.budget_limited,
    )


# --- Server activity ------------------------------------------------------------------------


class Call(BaseModel):
    tool: str
    status: StatusOut
    summary: str | None
    rationale: str | None
    duration_ms: int | None
    started_at: str


class ActivityPage(BaseModel):
    total: int
    calls: list[Call]
    next_cursor: str | None


def activity_page(conn: sqlite3.Connection, cursor: str | None, limit: int) -> ActivityPage:
    page = queries.server_activity(conn, cursor=cursor, limit=limit)
    return ActivityPage(
        total=page.total,
        calls=[
            Call(
                tool=s.name,
                status=status_out("span", s.status),
                summary=s.summary,
                rationale=s.rationale,
                duration_ms=s.duration_ms,
                started_at=s.started_at,
            )
            for s in page.items
        ],
        next_cursor=page.next_cursor,
    )


# --- Search -----------------------------------------------------------------------------------


class FoundScreen(BaseModel):
    state: str
    title: str
    route: str


class FoundRecord(BaseModel):
    key: str
    title: str
    kind: str
    portal: str


class FoundScan(BaseModel):
    id: str
    portal: str
    mode: str
    status: StatusOut
    started_at: str


class SearchPage(BaseModel):
    q: str
    portal: str | None
    total: int
    screens: list[FoundScreen]
    records: list[FoundRecord]
    scans: list[FoundScan]


def search_page(conn: sqlite3.Connection, q: str, portal: str | None) -> SearchPage:
    r = queries_screens.search(conn, q, portal)
    return SearchPage(
        q=r.q,
        portal=portal,
        total=r.total,
        screens=[
            FoundScreen(state=s.id, title=s.title or "(untitled page)", route=s.route_template)
            for s in r.screens
        ],
        records=[
            FoundRecord(key=d.key, title=d.title, kind=d.kind.replace("_", " "), portal=d.portal_id)
            for d in r.records
        ],
        scans=[
            FoundScan(
                id=x.id,
                portal=x.portal_id,
                mode=x.mode,
                status=status_out("run", x.status),
                started_at=x.started_at,
            )
            for x in r.runs
        ],
    )


# --- Scans by process -------------------------------------------------------------------------


class GroupScan(BaseModel):
    id: str
    persona: str
    mode: str
    status: StatusOut
    screens: int
    started_at: str


class ProcessScans(BaseModel):
    key: str
    title: str
    scans: list[GroupScan]


class ScanGroupsPage(BaseModel):
    portal: str
    processes: list[ProcessScans]
    unassigned: list[GroupScan]
    #: Scans in no process that share at least half their screens: likely one undocumented process.
    proposed: list[list[GroupScan]]


def scan_groups_page(conn: sqlite3.Connection, portal: str) -> ScanGroupsPage:
    inp = queries_run_groups.load_input(conn, portal)
    groups = queries_run_groups.group_runs(inp)
    infos = queries_run_groups.run_infos(conn, portal, inp)

    def scans(ids: list[str]) -> list[GroupScan]:
        return [
            GroupScan(
                id=i.id,
                persona=i.persona_id,
                mode=i.mode,
                status=status_out("run", i.status),
                screens=i.screens,
                started_at=i.started_at,
            )
            for i in (infos[x] for x in ids if x in infos)
        ]

    return ScanGroupsPage(
        portal=portal,
        processes=[
            ProcessScans(key=p.key, title=p.title, scans=scans(p.runs)) for p in groups.processes
        ],
        unassigned=scans(groups.unassigned),
        proposed=[scans(g) for g in groups.proposed],
    )
