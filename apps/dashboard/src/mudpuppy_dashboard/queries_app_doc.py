"""The React console's Docs, part 2 (R-96, spec 067; spec 004 R-15): one record (its facts, the
content of the revision shown as blocks, the process maps of its variants, the screens it cites
with their regions, the evidence, relations and revisions, the review panel, Prev / Next in the
list it was opened from) and one analysis session. Built over the htmx pages' read models
(`queries_docs`, `visuals`, `diagrams`, `neighbours`); statuses come mapped."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from urllib.parse import quote

from pydantic import BaseModel

from . import diagrams, neighbours, queries_processes, visuals
from . import queries_docs as qd
from .formats import short_id
from .models import ResolvedEvidence
from .queries_app import StatusOut, status_out
from .queries_app_doc_content import Block, content_blocks
from .queries_app_docs import NOT_OBSERVED, docs_base, record_href, session_href

# The scan sections a target lives on, by run page tab (`queries_docs.resolve_evidence`).
SCAN_TABS = ("states", "actions", "frontier", "forms", "network", "robots", "decisions", "process")


def scan_href(run: str, tab: str | None = None) -> str:
    shown = f"/{tab}" if tab in SCAN_TABS else ""
    return f"/app/scans/{quote(run, safe='')}{shown}"


class Ref(BaseModel):
    """A link with its word: a session, a record, a scan."""

    label: str
    href: str
    title: str | None = None


class Mark(BaseModel):
    n: int
    key: str
    note: str | None
    visible: bool
    left: float
    top: float
    width: float
    height: float


class Figure(BaseModel):
    state_id: str
    title: str
    route: str
    shot: str | None
    wire: str | None
    cut_at: int | None  # the screenshot was cut at this height (px)
    marks: list[Mark]


class VariantMap(BaseModel):
    variant: str
    outcome: StatusOut
    scan: Ref
    source: str


class Evidence(BaseModel):
    kind: str
    label: str | None
    resolved: bool
    #: Where the target is: a record, a rule, a recorded screen, a scan section, a review.
    href: str | None
    tag: str | None  # a record's or rule's key, shown as a tag
    region: str | None
    note: str | None
    scan: Ref | None
    scan_note: str | None  # the scan's mode and start, or "scan missing"


class Relation(BaseModel):
    direction: str  # Out (this revision points to) · In (points to this record)
    type: str
    key: str
    title: str
    status: StatusOut
    href: str


class Review(BaseModel):
    id: str
    action: StatusOut
    reviewer: str
    text: str | None
    at: str


class Revision(BaseModel):
    rev: int
    shown: bool
    href: str
    status: StatusOut
    confidence: StatusOut
    not_observable: bool
    change: str
    at: str
    change_note: str | None
    session: Ref
    reviews: list[Review]


class Panel(BaseModel):
    """Review (FR-037..039): on the latest revision; only a draft is confirmed or rejected."""

    enabled: bool
    rev: int
    status: str
    can_decide: bool
    viewing_latest: bool
    reviews: list[Review]


class Neighbours(BaseModel):
    position: int
    total: int
    label: str
    list: str  # the list's page in the console
    prev: str | None
    next: str | None


class ProcessLink(BaseModel):
    """A process record: its documentation export, and the workspace process it opened."""

    export: str
    linked: Ref | None
    can_open: bool


class RecordPage(BaseModel):
    portal: str
    #: The record's id: what the assistant's "This page" names (spec 022 R6).
    id: str
    key: str
    title: str
    kind: str
    status: StatusOut
    confidence: StatusOut
    not_observable: StatusOut | None
    followup: StatusOut | None
    blocked_reason: str | None
    rev: int
    latest_rev: int
    confirmed_rev: int | None
    is_latest: bool
    change: str
    change_note: str | None
    session: Ref
    written_at: str
    blocks: list[Block]
    variant_maps: list[VariantMap]
    figures: list[Figure]
    figures_open: bool
    evidence: list[Evidence]
    relations: list[Relation]
    history: list[Revision]
    panel: Panel
    neighbours: Neighbours | None
    process: ProcessLink | None


def _session(portal: str, session: str) -> Ref:
    return Ref(label=short_id(session), href=session_href(portal, session), title=session)


def _evidence_href(portal: str, e: ResolvedEvidence) -> tuple[str | None, str | None]:
    link = e.link
    kind = link.target_kind
    if not e.resolved:
        return (scan_href(link.run_id, e.tab) if link.run_id else None), None
    if kind == "doc_record" and e.doc_key:
        return record_href(portal, e.doc_key), e.doc_key
    if kind == "hypothesis" and e.doc_key:
        return f"/app/portals/{quote(portal, safe='')}/rules/{quote(e.doc_key, safe='')}", e.doc_key
    if kind == "review":
        return f"#review-{link.target_id}", None
    if kind in ("state", "screen_region"):
        return f"/states/{quote(link.target_id, safe='')}", None
    if not link.run_id:
        return None, None
    return f"{scan_href(link.run_id, e.tab)}#{quote(link.target_id, safe='')}", None


def _evidence(portal: str, e: ResolvedEvidence) -> Evidence:
    href, tag = _evidence_href(portal, e)
    label = e.label
    if e.link.target_kind == "hypothesis" and label and ": " in label:
        label = label.split(": ", 1)[1]
    run = e.link.run_id
    return Evidence(
        kind=e.link.target_kind.replace("_", " "),
        label=label,
        resolved=e.resolved,
        href=href,
        tag=tag,
        region=e.link.region,
        note=e.link.note,
        scan=Ref(label=short_id(run), href=scan_href(run), title=run) if run else None,
        scan_note=f"{e.run_mode or 'scan missing'} · {e.run_started_at or '—'}" if run else None,
    )


def _figure(f: visuals.Figure) -> Figure:
    st = f.state
    return Figure(
        state_id=st.id,
        title=st.title or st.route_template,
        route=st.route_template,
        shot=f"/evidence/{st.screenshot_ref}" if st.screenshot_ref else None,
        wire=f"/evidence/{f.wireframe.svg_ref}" if f.wireframe else None,
        cut_at=f.page_height if f.cut else None,
        marks=[Mark(**h.model_dump()) for h in f.highlights],
    )


def _relations(portal: str, d: qd.DocRecordDetail) -> list[Relation]:
    def status(r: qd.RelationRow, incoming: bool) -> StatusOut:
        if incoming and r.kind == "assumption" and r.status not in ("confirmed", "withdrawn"):
            return status_out("assumption", "to_check")
        return status_out("doc", r.status)

    return [
        Relation(
            direction=direction,
            type=r.type.replace("_", " "),
            key=r.key,
            title=r.title,
            status=status(r, direction == "In"),
            href=record_href(portal, r.key),
        )
        for direction, rows in (("Out", d.relations_out), ("In", d.relations_in))
        for r in rows
    ]


def _review(rv: qd.DocReview) -> Review:
    return Review(
        id=rv.id,
        action=status_out("review", rv.action),
        reviewer=rv.reviewer,
        text=rv.text,
        at=rv.created_at,
    )


def _history(portal: str, d: qd.DocRecordDetail) -> list[Revision]:
    rec = d.record
    out = []
    for h in d.history:
        v = h.revision
        gone = rec.withdrawn and v.rev_no == rec.latest_rev
        out.append(
            Revision(
                rev=v.rev_no,
                shown=v.rev_no == d.shown.rev_no,
                href=f"{record_href(portal, rec.key)}?rev={v.rev_no}",
                status=status_out("doc", "withdrawn" if gone else v.status),
                confidence=status_out("confidence", v.confidence),
                not_observable=v.not_observable,
                change=v.change,
                at=v.created_at,
                change_note=v.change_note,
                session=_session(portal, v.session_id),
                reviews=[_review(rv) for rv in h.reviews],
            )
        )
    return out


def _neighbours(
    conn: sqlite3.Connection, portal: str, list_url: str | None, key: str
) -> Neighbours | None:
    """Prev / Next in the Docs list the record was opened from (R-71); the `list` value is the
    htmx list's address, which `neighbours` rebuilds."""
    found = neighbours.ordered_list(conn, portal, list_url) if list_url else None
    if found is None or key not in found.ids:
        return None
    i = found.ids.index(key)

    def at(j: int) -> str | None:
        ok = 0 <= j < len(found.ids)
        return record_href(portal, found.ids[j], list_url) if ok else None

    query = list_url.partition("?")[2] if list_url else ""
    return Neighbours(
        position=i + 1,
        total=len(found.ids),
        label=found.label,
        list=f"{docs_base(portal)}{'?' + query if query else ''}",
        prev=at(i - 1),
        next=at(i + 1),
    )


def _variant_maps(conn: sqlite3.Connection, d: qd.DocRecordDetail) -> list[VariantMap]:
    if d.record.kind != "process":
        return []
    return [
        VariantMap(
            variant=m["variant"],
            outcome=status_out("outcome", m["outcome"] or ""),
            scan=Ref(label=short_id(m["run_id"]), href=scan_href(m["run_id"], "process")),
            source=diagrams.process_map(m),
        )
        for m in qd.process_diagram_inputs(conn, d)
    ]


def _process(conn: sqlite3.Connection, portal: str, d: qd.DocRecordDetail, reviewer: bool):
    if d.record.kind != "process":
        return None
    key = d.record.key
    linked = queries_processes.linked_process(conn, portal, key)
    p = quote(portal, safe="")
    return ProcessLink(
        export=f"/docs/{p}/{quote(key, safe='')}/export",
        linked=Ref(label=linked, href=f"/app/portals/{p}/processes/{quote(linked, safe='')}")
        if linked
        else None,
        can_open=reviewer and not linked,
    )


class RecordAsk(BaseModel):
    """Which record, which revision, from which list; whether a reviewer is set."""

    key: str
    rev: int | None = None
    list_url: str | None = None
    reviewer: bool = False


def record_page(
    conn: sqlite3.Connection, data_dir: Path, portal: str, ask: RecordAsk
) -> RecordPage | None:
    d = qd.record_detail(conn, portal, ask.key, ask.rev)
    if d is None:
        return None
    rec, shown = d.record, d.shown
    latest = d.history[0]
    figures = visuals.record_figures(conn, data_dir, d.evidence)
    return RecordPage(
        portal=portal,
        id=rec.id,
        key=rec.key,
        title=rec.title,
        kind=rec.kind.replace("_", " "),
        status=status_out("doc", d.status),
        confidence=status_out("confidence", shown.confidence),
        not_observable=NOT_OBSERVED if shown.not_observable else None,
        followup=status_out("followup", d.followup.status) if d.followup else None,
        blocked_reason=d.followup.blocked_reason if d.followup else None,
        rev=shown.rev_no,
        latest_rev=rec.latest_rev,
        confirmed_rev=rec.confirmed_rev,
        is_latest=d.is_latest,
        change=shown.change,
        change_note=shown.change_note,
        session=_session(portal, shown.session_id),
        written_at=shown.created_at,
        blocks=content_blocks(shown.content_json),
        variant_maps=_variant_maps(conn, d),
        figures=[_figure(f) for f in figures],
        figures_open=len(figures) <= visuals.FIGURES_OPEN,
        evidence=[_evidence(portal, e) for e in d.evidence],
        relations=_relations(portal, d),
        history=_history(portal, d),
        panel=Panel(
            enabled=ask.reviewer,
            rev=latest.revision.rev_no,
            status=latest.revision.status,
            can_decide=latest.revision.status == "draft",
            viewing_latest=d.is_latest,
            reviews=[_review(rv) for rv in latest.reviews],
        ),
        neighbours=_neighbours(conn, portal, ask.list_url, rec.key),
        process=_process(conn, portal, d, ask.reviewer),
    )
