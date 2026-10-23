"""The React console's recorded screen (R-100, spec 071; spec 008, design screen 08): one observed
revision of a screen with its picture and elements, the URLs it was reached under, its form step,
its revisions and the records citing it, as typed JSON. Its amendments and access are in
`queries_app_state_side`. Statuses come mapped; pictures and files come as URLs."""

from __future__ import annotations

import sqlite3
from typing import Any

from pydantic import BaseModel

from . import queries_revisions, queries_screens, queries_suites, queries_urls, visuals
from .queries_app import StatusOut, status_out


class Box(BaseModel):
    """An element's place on the screenshot, in percent of the image."""

    key: str
    left: float
    top: float
    width: float
    height: float


class Hop(BaseModel):
    kind: str
    status: int | None
    url: str
    reason: str | None


class EntryUrl(BaseModel):
    url: str
    visits: int
    via: list[str]
    hops: list[Hop]


class Param(BaseModel):
    name: str
    where: str
    #: Each value as stored; None for a parameter without a value.
    values: list[str | None]
    distinct: int
    visits: int


class Revision(BaseModel):
    state: str
    rev: int
    created_at: str
    first_seen_run: str
    runs: list[str]
    personas: list[str]
    latest: bool


class StepState(BaseModel):
    state: str
    title: str
    kind: StatusOut


class Message(BaseModel):
    field: str | None
    text: str
    native: bool


class Outcome(BaseModel):
    probe: str
    fault: str | None
    target: str | None
    status: StatusOut
    accepted: bool
    possible_new_process: bool
    to_state: str | None
    messages: list[Message]
    reason: str | None


class FormStep(BaseModel):
    step: int
    label: str
    route: str
    #: Outcomes per probe group (validation, branch, technical).
    groups: list[tuple[str, int]]
    mark: tuple[str, str] | None
    states: list[StepState]
    outcomes: list[Outcome]


class Citing(BaseModel):
    key: str
    title: str
    portal: str
    regions: list[str]


class ProcessUse(BaseModel):
    name: str
    role: str


class StateHead(BaseModel):
    id: str
    portal: str
    title: str
    route: str
    cluster: str
    confidence: StatusOut
    stabilization: str
    first_seen_run: str
    created_at: str
    #: The screenshot's URL; None: the state has only a wireframe (or nothing).
    shot: str | None
    #: The wireframe's SVG, its Excalidraw file and the snapshot, as URLs.
    wire: str | None
    excalidraw: str | None
    snapshot: str


class StatePage(BaseModel):
    head: StateHead
    #: Every boxed element (Show elements, the assistant's highlight).
    elements: list[Box]
    element_count: int
    urls: list[EntryUrl]
    urls_more: int
    params: list[Param]
    revisions: list[Revision]
    processes: list[ProcessUse]
    form_step: FormStep | None
    citing: list[Citing]


def _evidence(ref: str | None) -> str | None:
    return f"/evidence/{ref}" if ref else None


def _head(conn: sqlite3.Connection, page: visuals.StatePage) -> StateHead:
    st = page.figure.state
    wire = visuals.wireframe_of(conn, st.id)
    return StateHead(
        id=st.id,
        portal=st.portal_id,
        title=st.title,
        route=st.route_template,
        cluster=st.cluster_id,
        confidence=status_out("confidence", st.confidence),
        stabilization=st.stabilization.replace("_", " "),
        first_seen_run=st.first_seen_run,
        created_at=st.created_at,
        shot=_evidence(st.screenshot_ref),
        wire=_evidence(wire.svg_ref if wire else None),
        excalidraw=_evidence(wire.excalidraw_ref if wire else None),
        snapshot=f"/evidence/{st.evidence_ref}",
    )


def urls_out(urls: queries_urls.StateUrls | None) -> tuple[list[EntryUrl], int, list[Param]]:
    """The URLs a recording was reached under, how many more, and their parameters."""
    if urls is None:
        return [], 0, []
    entries = [
        EntryUrl(
            url=e.url,
            visits=e.visits,
            via=e.via,
            hops=[
                Hop(
                    kind=h["kind"].replace("_", " "),
                    status=h.get("status"),
                    url=h["url"],
                    reason=h.get("reason"),
                )
                for h in e.last_hops
                if h["kind"] != "start"
            ],
        )
        for e in urls.entry_urls
    ]
    params = [
        Param(
            name=p.name,
            where=p.where.replace("_", " "),
            values=p.values,
            distinct=p.distinct,
            visits=p.visits,
        )
        for p in urls.params
    ]
    return entries, urls.entry_urls_more, params


def _revisions(screen: queries_revisions.ScreenRevisions | None) -> list[Revision]:
    if screen is None:
        return []
    latest = screen.latest()
    return [
        Revision(
            state=r.state_id,
            rev=r.rev,
            created_at=r.created_at,
            first_seen_run=r.first_seen_run,
            runs=r.runs,
            personas=r.personas,
            latest=r is latest,
        )
        for r in screen.revisions
    ]


def _outcome(o: queries_suites.StepOutcome) -> Outcome:
    messages: list[dict[str, Any]] = o.messages
    return Outcome(
        probe=o.probe,
        fault=o.fault.replace("_", " ") if o.fault else None,
        target=o.target,
        status=status_out("probe_outcome", o.kind),
        accepted=o.accepted,
        possible_new_process=o.possible_new_process,
        to_state=o.to_state,
        messages=[
            Message(
                field=m.get("field"),
                text=str(m.get("text", "")),
                native=m.get("source") == "native",
            )
            for m in messages
        ],
        reason=o.reason,
    )


def form_step_out(fs: queries_suites.FormStepView | None) -> FormStep | None:
    """A form step with its states and what each probe did; None for no form step."""
    if fs is None:
        return None
    return FormStep(
        step=fs.step_index,
        label=fs.label,
        route=fs.route,
        groups=fs.group_counts(),
        mark=(fs.mark.by, fs.mark.at) if fs.mark else None,
        states=[
            StepState(state=s.id, title=s.title, kind=status_out("state_kind", s.kind))
            for s in fs.states
        ],
        outcomes=[_outcome(o) for o in fs.outcomes],
    )


def state_page(conn: sqlite3.Connection, page: visuals.StatePage) -> StatePage:
    """The recorded screen (`visuals.state_page` read it)."""
    state_id = page.figure.state.id
    entries, more, params = urls_out(queries_urls.state_urls(conn, state_id))
    return StatePage(
        head=_head(conn, page),
        elements=[
            Box(key=e.key, left=e.left, top=e.top, width=e.width, height=e.height)
            for e in page.elements
        ],
        element_count=page.element_count,
        urls=entries,
        urls_more=more,
        params=params,
        revisions=_revisions(queries_revisions.screen_of_state(conn, state_id)),
        processes=[
            ProcessUse(name=u.name, role=u.role)
            for u in queries_screens.processes_of_state(conn, state_id)
        ],
        form_step=form_step_out(queries_suites.form_step_of_state(conn, state_id)),
        citing=[
            Citing(key=r.key, title=r.title, portal=r.portal_id, regions=r.regions)
            for r in page.citing
        ],
    )
