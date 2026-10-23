"""The React console's Docs (R-96, spec 066; spec 004 R-15, FR-030): a portal's documentation as
an SRS, its sections with their record counts, the overview, and each section's records filtered
and paged by cursor, with the capability map and the screen navigation. Built over the htmx
pages' read model (`queries_docs`, `diagrams`), so both show the same; statuses come mapped."""

from __future__ import annotations

import sqlite3
from typing import NamedTuple
from urllib.parse import quote, urlencode

from pydantic import BaseModel

from . import diagrams
from . import queries_docs as qd
from .formats import short_id
from .queries_app import StatusOut, status_out
from .queries_app_review_detail import Option
from .queries_app_scan_tabs import PageAt


class DocsQuery(NamedTuple):
    """The page's query: the section, its filters and where the page starts."""

    section: str = "overview"
    kind: str | None = None
    status: str | None = None
    confidence: str | None = None
    flag: str | None = None
    cursor: str | None = None


class Section(BaseModel):
    id: str
    label: str
    count: int


class StatusCount(BaseModel):
    status: StatusOut
    count: int


class SessionRow(BaseModel):
    id: str
    short: str
    status: StatusOut
    started_at: str
    summary: str | None
    #: The session's page, on the htmx Docs until spec 067.
    href: str


class RecordRow(BaseModel):
    key: str
    title: str
    kind: str  # in words ("business rule")
    status: StatusOut
    confidence: StatusOut
    rev: int
    summary: str | None
    not_observable: StatusOut | None
    followup: StatusOut | None
    blocked_reason: str | None
    #: The revision a person confirmed, when it is older than the one shown.
    confirmed_rev: int | None
    evidence: int
    scans: int
    related: list[str]  # traceability: the keys its latest revision points to
    #: The record's page (htmx until spec 067), with this list for its Prev / Next.
    href: str


class Filters(BaseModel):
    kinds: list[Option]  # empty: the section has one kind
    statuses: list[Option]
    confidences: list[Option]
    flags: list[Option]
    kind: str | None
    status: str | None
    confidence: str | None
    flag: str | None


class Records(BaseModel):
    items: list[RecordRow]
    total: int
    next_cursor: str | None
    filters: Filters
    #: Traceability shows evidence, scans and linked records instead of revision and notes.
    matrix: bool


class Diagram(BaseModel):
    source: str
    caption: str


class DocsPage(BaseModel):
    portal: str
    sections: list[Section]
    section: Section
    statuses: list[StatusCount]
    #: The overview: the sections with records and the latest analysis sessions.
    counts: list[Section]
    sessions: list[SessionRow]
    records: Records | None
    diagram: Diagram | None


NOT_OBSERVED = StatusOut(shape="unobserved", word="Not observed")
VIEWS = ("overview", "traceability")


def _base(portal: str) -> str:
    return f"/docs/{quote(portal, safe='')}"


def _row(portal: str, r: qd.DocRecordRow, listed: str) -> RecordRow:
    older = r.record.confirmed_rev
    return RecordRow(
        key=r.record.key,
        title=r.record.title,
        kind=r.record.kind.replace("_", " "),
        status=status_out("doc", r.status),
        confidence=status_out("confidence", r.confidence),
        rev=r.rev_no,
        summary=r.summary,
        not_observable=NOT_OBSERVED if r.not_observable else None,
        followup=status_out("followup", r.followup_status) if r.followup_status else None,
        blocked_reason=r.blocked_reason,
        confirmed_rev=older if older and older != r.rev_no else None,
        evidence=r.evidence_count,
        scans=r.run_count,
        related=r.related,
        href=f"{_base(portal)}/{quote(r.record.key, safe='')}?{urlencode({'list': listed})}",
    )


def _filters(q: DocsQuery, kinds: tuple[str, ...]) -> Filters:
    many = len(kinds) > 1
    return Filters(
        kinds=[Option(value=k, label=k.replace("_", " ")) for k in kinds] if many else [],
        statuses=[Option(value=s, label=status_out("doc", s).word) for s in qd.DOC_STATUSES],
        confidences=[
            Option(value=s, label=status_out("confidence", s).word) for s in qd.CONFIDENCES
        ],
        flags=[Option(value=k, label=w) for k, w in qd.FLAGS],
        kind=q.kind if q.kind in kinds and many else None,
        status=q.status if q.status in qd.DOC_STATUSES else None,
        confidence=q.confidence if q.confidence in qd.CONFIDENCES else None,
        flag=q.flag if q.flag in dict(qd.FLAGS) else None,
    )


def _records(conn: sqlite3.Connection, portal: str, q: DocsQuery, limit: int) -> Records:
    kinds = qd.SECTION_KINDS[q.section]
    f = _filters(q, kinds)
    page = qd.list_records(
        conn,
        portal,
        kinds,
        kind=f.kind,
        status=f.status,
        confidence=f.confidence,
        flag=f.flag,
        cursor=q.cursor,
        limit=limit,
    )
    items = page.items
    if q.section == "traceability":
        items = qd.attach_related(conn, items)
    shown = {"kind": f.kind, "status": f.status, "confidence": f.confidence, "flag": f.flag}
    # The list a record page walks with Prev / Next (R-71): this section and its filters.
    listed = f"{_base(portal)}?" + urlencode(
        {"section": q.section, **{k: v for k, v in shown.items() if v}}
    )
    return Records(
        items=[_row(portal, r, listed) for r in items],
        total=page.total,
        next_cursor=page.next_cursor,
        filters=f,
        matrix=q.section == "traceability",
    )


def _diagram(conn: sqlite3.Connection, portal: str, section: str) -> Diagram | None:
    if section == "capabilities":
        data = qd.capability_diagram_input(conn, portal)
        if data["capabilities"]:
            caption = "Capability map: capabilities and what they contain"
            return Diagram(source=diagrams.capability_map(data), caption=caption)
    elif section == "screens":
        data = qd.screen_diagram_input(conn, portal)
        if data["screens"]:
            omitted = data["omitted"]
            left_out = (
                f" ({omitted} global-navigation links to widely linked screens left out)"
                if omitted
                else ""
            )
            caption = f"Screen navigation: transitions between screens{left_out}"
            return Diagram(source=diagrams.screen_nav(data), caption=caption)
    return None


def _sessions(conn: sqlite3.Connection, portal: str) -> list[SessionRow]:
    return [
        SessionRow(
            id=s.id,
            short=short_id(s.id),
            status=status_out("run", s.status),
            started_at=s.started_at,
            summary=s.summary,
            href=f"{_base(portal)}/sessions/{quote(s.id, safe='')}",
        )
        for s in qd.portal_sessions(conn, portal, limit=5)
    ]


def docs_page(conn: sqlite3.Connection, portal: str, q: DocsQuery, at: PageAt) -> DocsPage:
    section = q.section if q.section in qd.DOC_SECTION_IDS else "overview"
    q = q._replace(section=section, cursor=at.cursor)
    counts = qd.section_counts(conn, portal)
    sections = [Section(id=s, label=label, count=counts[s]) for s, label, _ in qd.DOC_SECTIONS]
    statuses = qd.status_counts(conn, portal)
    overview = section == "overview"
    return DocsPage(
        portal=portal,
        sections=sections,
        section=next(s for s in sections if s.id == section),
        statuses=[
            StatusCount(status=status_out("doc", s), count=statuses[s])
            for s in qd.DOC_STATUSES
            if statuses.get(s)
        ],
        counts=[s for s in sections if s.id not in VIEWS] if overview else [],
        sessions=_sessions(conn, portal) if overview else [],
        records=None if overview else _records(conn, portal, q, at.limit),
        diagram=_diagram(conn, portal, section),
    )
