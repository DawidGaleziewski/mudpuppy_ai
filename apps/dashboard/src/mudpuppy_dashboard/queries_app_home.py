"""The React console's portal home (R-96, spec 051; designer screen v2-01, UX-R01–R03): the read
model `queries_portal_home.portal_home` as a typed JSON shape. Statuses come mapped
by the one status map, so the app shows shape and word without a mapping of its own."""

from __future__ import annotations

import sqlite3

from pydantic import BaseModel

from .queries_app import NeedsItem, StatusOut, needs_item, status_out
from .queries_portal_home import portal_home
from .queries_review import KINDS
from .scan_words import kind_word, when_words


class Lane(BaseModel):
    """A portal part's latest release (a lane of the release timeline)."""

    part: str
    release: str
    #: True: the release is named by a marker the portal shows; False: told apart by asset hashes.
    observed: bool
    since: str
    was: str | None


class LastScan(BaseModel):
    id: str
    started_at: str
    status: StatusOut
    #: AI scan, or Check run (a re-scan that checks the model, no AI): the scan line's kind word.
    kind: str
    steps: int
    #: After the id, in the scan line's grammar (designer 19/12): "17 Oct 10:05Z · 64 steps".
    summary: str


class KindCount(BaseModel):
    kind: str
    label: str
    count: int


class Needs(BaseModel):
    total: int
    by_kind: list[KindCount]
    top: list[NeedsItem]


class ProcessChanges(BaseModel):
    key: str | None
    name: str
    changes: int
    needs: int
    explained: int


class Changes(BaseModel):
    all: int
    needs: int
    explained: int
    by_process: list[ProcessChanges]


class RuleCount(BaseModel):
    status: StatusOut
    count: int


class Rules(BaseModel):
    total: int
    by_status: list[RuleCount]


class PortalHomeData(BaseModel):
    portal: str
    environment: str
    model_seq: int | None
    model_built_at: str | None
    lanes: list[Lane]
    last_scan: LastScan | None
    needs: Needs
    changes: Changes
    processes: int
    proposed: int
    rules: Rules


def portal_scanned(conn: sqlite3.Connection, portal: str) -> bool:
    """True when the store holds at least one scan of the portal."""
    row = conn.execute("SELECT 1 FROM runs WHERE portal_id = ? LIMIT 1", (portal,)).fetchone()
    return row is not None


def _lanes(h_timeline: object) -> list[Lane]:
    lanes = getattr(h_timeline, "lanes", None) or []
    out = []
    for lane in lanes:
        cur = lane.spans[-1]
        was = [s for s in lane.spans if not s.rollout]
        out.append(
            Lane(
                part=lane.name,
                release=cur.name,
                observed=lane.marker,
                since=cur.start,
                was=was[-2].name if len(was) > 1 else None,
            )
        )
    return out


def portal_home_data(conn: sqlite3.Connection, portal: str, env: str) -> PortalHomeData:
    h = portal_home(conn, portal)
    ch = h.changes
    groups = [(g, len([c for c in g.changes if c.status != "explained"])) for g in ch.groups]
    return PortalHomeData(
        portal=portal,
        environment=env,
        model_seq=h.model_seq,
        model_built_at=h.model_built_at,
        lanes=_lanes(h.timeline),
        last_scan=LastScan(
            id=h.last_scan.id,
            started_at=h.last_scan.started_at,
            status=status_out("run", h.last_scan.status),
            kind=kind_word("probe" if h.last_scan.check else "map"),
            steps=h.last_scan.steps,
            summary=f"{when_words(h.last_scan.started_at)} · {h.last_scan.steps}"
            f" {'checks' if h.last_scan.check else 'steps'}",
        )
        if h.last_scan
        else None,
        needs=Needs(
            total=h.inbox.total,
            by_kind=[
                KindCount(kind=k, label=label, count=h.inbox.count(k))
                for k, label in KINDS
                if h.inbox.count(k)
            ],
            top=[needs_item(kind, it) for kind, it in h.top],
        ),
        changes=Changes(
            all=ch.counts.get("all", 0),
            needs=ch.counts.get("needs", 0),
            explained=ch.counts.get("explained", 0),
            by_process=[
                ProcessChanges(
                    key=g.key,
                    name=g.name,
                    changes=len(g.changes),
                    needs=n,
                    explained=len(g.changes) - n,
                )
                for g, n in groups
            ],
        ),
        processes=h.processes,
        proposed=h.proposed,
        rules=Rules(
            total=len(h.rules.rules),
            by_status=[
                RuleCount(status=status_out("rule", s), count=n)
                for s, n in h.rules.counts.items()
                if n
            ],
        ),
    )
