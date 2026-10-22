"""Home ▸ All portals (spec 040 T020, designer screen v2-15, UX-R01–R02): one row per portal with
its release per portal part, the last scan, the changes since the previous release, what needs a
person and how far its processes are explored; and a preview of Review across portals, newest
first (Review itself stays per portal: 12-v2-ux § 12, open question 1). Read-only, composed from
the per-portal read models."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from . import queries_review
from .queries_changes import changes_view, range_from, rows_of
from .queries_portal_home import LastScan, last_scan
from .queries_queue import QueueItem
from .queries_releases import timeline

KIND_WORDS = dict(queries_review.KINDS)


@dataclass(frozen=True)
class Release:
    part: str
    name: str  # "3e1a"; "" when the part has no release marker
    since: str


@dataclass(frozen=True)
class PortalRow:
    portal: str
    has_model: bool
    releases: list[Release]
    last_scan: LastScan | None
    changes: int  # since the previous release
    needs: int  # of those, waiting for a person
    explained: int
    review: int  # items in Review (every group)
    processes: int
    explored: int  # processes with an exploration run


@dataclass(frozen=True)
class AllPortals:
    rows: list[PortalRow]
    preview: list[tuple[str, str, QueueItem]]  # (portal, group word, item), newest first

    @property
    def changes(self) -> int:
        return sum(r.changes for r in self.rows)

    @property
    def review(self) -> int:
        return sum(r.review for r in self.rows)


def _releases(conn: sqlite3.Connection, portal: str) -> list[Release]:
    tl = timeline(conn, portal)
    out = []
    for lane in tl.lanes if tl else []:
        current = next((s for s in lane.spans if s.current), lane.spans[-1] if lane.spans else None)
        if current:
            out.append(Release(lane.name, current.name if lane.marker else "", current.start))
    return out


def _count(conn: sqlite3.Connection, sql: str, portal: str) -> int:
    rows = rows_of(conn, sql, (portal,))
    return int(rows[0][0]) if rows else 0


def portal_row(conn: sqlite3.Connection, portal: str) -> tuple[PortalRow, queries_review.Inbox]:
    start, _ = range_from(conn, portal)
    v = changes_view(conn, portal, from_seq=start)
    inbox = queries_review.inbox(conn, portal)
    return (
        PortalRow(
            portal=portal,
            has_model=v.latest_seq is not None,
            releases=_releases(conn, portal),
            last_scan=last_scan(conn, portal),
            changes=v.counts.get("all", 0),
            needs=v.counts.get("needs", 0),
            explained=v.counts.get("explained", 0),
            review=inbox.total,
            processes=_count(
                conn,
                "SELECT count(*) FROM ba_processes WHERE portal_id = ? AND archived_at IS NULL",
                portal,
            ),
            explored=_count(
                conn,
                "SELECT count(DISTINCT p.id) FROM ba_processes p JOIN process_explorations x"
                " ON x.process_id = p.id WHERE p.portal_id = ? AND p.archived_at IS NULL",
                portal,
            ),
        ),
        inbox,
    )


def all_portals(conn: sqlite3.Connection, portals: list[str], preview: int = 3) -> AllPortals:
    rows, items = [], []
    for p in portals:
        row, inbox = portal_row(conn, p)
        rows.append(row)
        for kind in ("findings", "rules", "removals", "processes"):
            items += [(p, KIND_WORDS.get(kind, kind), i) for i in getattr(inbox, kind)]
    items.sort(key=lambda x: x[2].at, reverse=True)
    return AllPortals(rows, items[:preview])
