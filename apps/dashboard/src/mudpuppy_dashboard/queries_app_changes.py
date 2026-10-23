"""The React console's What changed (R-96, spec 064; designer screen v2-02): the range, its
release lanes, the counts and filters, the changes grouped by process then screen and the
explanations' legend. Built over the htmx page's own read models (`queries_changes`,
`queries_releases`), so both show the same; statuses come mapped (`status_out`)."""

from __future__ import annotations

import sqlite3
from typing import NamedTuple
from urllib.parse import urlencode

from pydantic import BaseModel

from . import queries_changes as qc
from .formats import fmt_when
from .queries_app import Chip, StatusOut, status_out
from .queries_app_review_detail import Option
from .queries_releases import Timeline, timeline


class ChangesQuery(NamedTuple):
    """The page's query as the address gives it: the range's start and end, the filters."""

    from_seq: str | None = None
    to_seq: int | None = None
    from_date: str | None = None
    from_scan: str | None = None
    show: str = "all"
    kind: str | None = None
    process: str | None = None


class ReleaseSpan(BaseModel):
    """One release of a portal part on its lane, in percent of the track."""

    name: str
    left: float
    width: float
    start: str
    end: str
    current: bool
    rollout: bool  # old and new served together
    unknown: bool  # the part has no release marker: told apart by asset hashes
    href: str  # Changes from this release's start


class ReleaseLane(BaseModel):
    name: str
    scope: str
    spans: list[ReleaseSpan]


class ScanMark(BaseModel):
    id: str
    left: float
    at: str
    status: str
    check: bool  # a check run (probe mode, no AI)


class Tick(BaseModel):
    left: float
    label: str


class Releases(BaseModel):
    """The release timeline (`queries_releases.Timeline`) with the chosen range's bracket."""

    lanes: list[ReleaseLane]
    scans: list[ScanMark]
    axis: list[Tick]
    start: str
    end: str
    range_left: float | None
    range_width: float | None
    range_label: str


class Range(BaseModel):
    """What the range was chosen by (release, version, first, date or scan) and the choices."""

    how: str
    from_seq: int
    to_seq: int | None
    from_date: str
    from_scan: str
    #: From: "" the previous release, "0" the first scan, then each model version but the newest.
    froms: list[Option]
    #: To: each model version, newest ("Now") first.
    tos: list[Option]
    #: Or from a scan: newest first.
    scans: list[Option]


class ChangeRow(BaseModel):
    id: str
    kind: str
    word: Chip  # the kind's chip; a broken rule is a failure
    finding: str
    explanation: Chip
    explanation_text: str
    reason: str | None  # the hypothesis's latest reason, while it still needs someone
    status: StatusOut
    hypothesis_key: str | None
    model_seq: int
    at: str
    element_key: str | None


class ScreenGroup(BaseModel):
    key: str | None
    title: str
    route: str | None
    count: int
    needs: int
    changes: list[ChangeRow]


class ProcessGroup(BaseModel):
    key: str | None  # PRC-nnn; None = Not in a process
    name: str
    count: int
    needs: int
    screens: list[ScreenGroup]


class LegendRow(BaseModel):
    chip: Chip
    text: str
    count: int


class ChangesPage(BaseModel):
    portal: str
    #: False: no portal model yet (built after every scan, or with `pnpm model:reconcile`).
    has_model: bool
    counts: dict[str, int]  # all · needs · explained · waiting
    show: str
    kind: str | None
    process: str | None
    kinds: list[Option]
    processes: list[Option]
    range: Range | None
    releases: Releases | None
    shown: int
    groups: list[ProcessGroup]
    legend: list[LegendRow]
    #: The legend's three statuses: needs you, explained automatically, waiting for a check.
    statuses: list[StatusOut]


def changes_href(portal: str, **query: str | int | None) -> str:
    """The React What changed with this query (empty values left out)."""
    args = {k: v for k, v in query.items() if v not in (None, "")}
    tail = f"?{urlencode(args)}" if args else ""
    return f"/app/portals/{portal}/changes{tail}"


def chip_of(e: qc.Explanation) -> Chip:
    return Chip(word=e.word, variant=e.chip or None)


def row_of(c: qc.Change) -> ChangeRow:
    return ChangeRow(
        id=c.id,
        kind=c.kind,
        word=Chip(word=c.word, variant="fail" if c.kind == "rule_mismatch" else None),
        finding=c.finding,
        explanation=chip_of(c.explanation),
        explanation_text=c.explanation.text,
        reason=c.reason if c.status != "explained" else None,
        status=status_out("deviation", c.status),
        hypothesis_key=c.hypothesis_key,
        model_seq=c.model_seq,
        at=c.created_at,
        element_key=c.element_key,
    )


def _groups(v: qc.ChangesView) -> list[ProcessGroup]:
    return [
        ProcessGroup(
            key=g.key,
            name=g.name,
            count=len(g.changes),
            needs=sum(c.status != "explained" for c in g.changes),
            screens=[
                ScreenGroup(
                    key=s.key,
                    title=s.title,
                    route=s.route,
                    count=len(s.changes),
                    needs=s.needs,
                    changes=[row_of(c) for c in s.changes],
                )
                for s in g.screens
            ],
        )
        for g in v.groups
    ]


def _legend(v: qc.ChangesView) -> list[LegendRow]:
    seen: dict[str, qc.Explanation] = {}
    for c in v.all_changes():
        seen.setdefault(c.explanation.word, c.explanation)
    return [LegendRow(chip=chip_of(e), text=e.text, count=v.legend[w]) for w, e in seen.items()]


def _version(x: qc.Version) -> str:
    return f"Model version {x.seq} · {fmt_when(x.built_at)}"


def _range(v: qc.ChangesView, how: str, q: ChangesQuery, tl: Timeline | None) -> Range:
    froms = [Option(value="", label="Since the previous release")]
    if how in ("date", "scan"):
        chosen = f"Scan {q.from_scan}" if how == "scan" else f"Date {q.from_date}"
        froms.append(Option(value=str(v.from_seq), label=f"{chosen} · after version {v.from_seq}"))
    froms += [Option(value="0", label="The first scan")]
    froms += [Option(value=str(x.seq), label=_version(x)) for x in v.versions[:-1]]
    tos = [
        Option(value=str(x.seq), label=("Now · " if i == 0 else "") + _version(x))
        for i, x in enumerate(reversed(v.versions))
    ]
    scans = [
        Option(value=s.id, label=f"{fmt_when(s.started_at)}{' · check run' if s.check else ''}")
        for s in reversed(tl.scans if tl else [])
    ]
    return Range(
        how=how,
        from_seq=v.from_seq,
        to_seq=v.to_seq,
        from_date=(q.from_date or "")[:10],
        from_scan=q.from_scan or "",
        froms=froms,
        tos=tos,
        scans=scans,
    )


def releases_of(portal: str, tl: Timeline, label: str) -> Releases:
    return Releases(
        lanes=[
            ReleaseLane(
                name=lane.name,
                scope=lane.scope,
                spans=[
                    ReleaseSpan(
                        name=s.name,
                        left=s.left,
                        width=s.width,
                        start=s.start,
                        end=s.end,
                        current=s.current,
                        rollout=s.rollout,
                        unknown=not lane.marker and not s.rollout,
                        href=changes_href(portal, from_date=s.start),
                    )
                    for s in lane.spans
                ],
            )
            for lane in tl.lanes
        ],
        scans=[
            ScanMark(id=s.id, left=s.left, at=s.started_at, status=s.status, check=s.check)
            for s in tl.scans
        ],
        axis=[Tick(left=left, label=text) for left, text in tl.axis],
        start=tl.start,
        end=tl.end,
        range_left=tl.range_left,
        range_width=tl.range_width,
        range_label=label,
    )


STATUSES = ("open", "explained", "waiting_test")


def changes_page(conn: sqlite3.Connection, portal: str, q: ChangesQuery) -> ChangesPage:
    """The page for `q`: the same range, filters and groups as the htmx What changed."""
    seq = int(q.from_seq) if q.from_seq and q.from_seq.isdigit() else None  # "": previous release
    start, how = qc.range_from(conn, portal, seq, q.from_date or None, q.from_scan or None)
    v = qc.changes_view(
        conn,
        portal,
        qc.ChangeFilter(start, q.to_seq, q.show, q.kind or None, q.process or None),
    )
    built = {x.seq: x.built_at for x in v.versions}
    tl = None
    if v.latest_seq is not None:
        tl = timeline(conn, portal, built.get(start), built.get(v.to_seq or 0))
    label = f"this range · {v.counts['all']} changes"
    return ChangesPage(
        portal=portal,
        has_model=v.latest_seq is not None,
        counts=v.counts or {"all": 0, "needs": 0, "explained": 0, "waiting": 0},
        show=v.show,
        kind=v.kind,
        process=v.process,
        kinds=[Option(value=k, label=w) for k, w in qc.KIND_WORDS.items()],
        processes=[Option(value=k, label=f"{name} · {n}") for k, name, n in v.processes],
        range=_range(v, how, q, tl) if v.latest_seq is not None else None,
        releases=releases_of(portal, tl, label) if tl else None,
        shown=len(v.all_changes()),
        groups=_groups(v),
        legend=_legend(v),
        statuses=[status_out("deviation", s) for s in STATUSES],
    )
