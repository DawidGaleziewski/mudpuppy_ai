"""The React console's All portals (R-100, spec 071; spec 040 T020, designer v2-15, UX-R01–R02):
one row per portal (its release per part, the last scan, the changes since the previous release,
what needs a person, how far its processes are explored) and a preview of Review across portals,
newest first, as typed JSON over `queries_all_portals`."""

from __future__ import annotations

import sqlite3

from pydantic import BaseModel

from . import queries_all_portals
from .queries_app import NeedsItem, StatusOut, needs_item, status_out


class Release(BaseModel):
    part: str
    #: "3e1a"; empty when the part has no release marker.
    name: str
    since: str


class LastScan(BaseModel):
    id: str
    started_at: str
    status: StatusOut
    check: bool
    steps: int


class PortalRow(BaseModel):
    portal: str
    has_model: bool
    releases: list[Release]
    last_scan: LastScan | None
    changes: int
    needs: int
    explained: int
    review: int
    processes: int
    explored: int


class PreviewItem(BaseModel):
    portal: str
    group: str
    item: NeedsItem


class AllPortalsPage(BaseModel):
    rows: list[PortalRow]
    changes: int
    review: int
    preview: list[PreviewItem]


def _row(r: queries_all_portals.PortalRow) -> PortalRow:
    s = r.last_scan
    return PortalRow(
        portal=r.portal,
        has_model=r.has_model,
        releases=[Release(part=x.part, name=x.name, since=x.since) for x in r.releases],
        last_scan=LastScan(
            id=s.id,
            started_at=s.started_at,
            status=status_out("run", s.status),
            check=s.check,
            steps=s.steps,
        )
        if s
        else None,
        changes=r.changes,
        needs=r.needs,
        explained=r.explained,
        review=r.review,
        processes=r.processes,
        explored=r.explored,
    )


def all_portals_page(conn: sqlite3.Connection, portals: list[str]) -> AllPortalsPage:
    a = queries_all_portals.all_portals(conn, portals)
    return AllPortalsPage(
        rows=[_row(r) for r in a.rows],
        changes=a.changes,
        review=a.review,
        preview=[PreviewItem(portal=p, group=g, item=needs_item(g, it)) for p, g, it in a.preview],
    )
