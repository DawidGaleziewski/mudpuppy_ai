"""The React console's Processes list (R-96, spec 057; designer screen 04): the read models
`queries_processes` and `queries_process_doc.pictures` as typed JSON. Statuses come mapped;
pictures as URLs the dashboard serves. Read-only."""

from __future__ import annotations

import sqlite3
from typing import Any

from pydantic import BaseModel

from . import pager, queries_process_doc, queries_process_scope, queries_processes
from .queries_app import StatusOut, status_out


class ModelOut(BaseModel):
    label: str
    #: as-is, to-be.
    kind: str
    rev: int
    #: "Draft open" when someone has a draft of it; None without one.
    draft: StatusOut | None


class LiveOut(BaseModel):
    environment: str
    status: StatusOut
    #: "B r2": the model revision live there.
    what: str


class ProcessRowOut(BaseModel):
    id: str
    key: str
    name: str
    persona: str
    rev: int
    stage: StatusOut
    start_route: str | None
    end_route: str | None
    models: list[ModelOut]
    live: list[LiveOut]
    screens: int
    amendments: int
    last_by: str
    last_at: str


class SuggestionOut(BaseModel):
    id: str
    name: str
    persona: str
    routes: list[str]
    why: str


class LooseScreen(BaseModel):
    state: str
    title: str
    route: str
    shot: str | None
    wire: str | None
    scans: int
    #: The model screen it is a variant of (its page, its variants in the picture dialog), if any.
    screen_key: str | None = None
    #: When a scan last saw it, and how many variants its screen has (the sorting grid's line).
    last_seen: str | None = None
    variants: int = 1


class TargetOut(BaseModel):
    """A saved process the Add to process menu offers (designer T-05): its persona, step count,
    and the screens already in it (shown "already in", disabled)."""

    id: str
    key: str
    name: str
    persona: str
    steps: int
    states: list[str]


class ProcessList(BaseModel):
    portal: str
    archived: bool
    archived_count: int
    page: int
    pages: int
    total: int
    #: The stages in their order, mapped (the legend); "Suggested" comes first.
    stages: list[StatusOut]
    rows: list[ProcessRowOut]
    suggestions: list[SuggestionOut]
    #: What a suggestion is: inferred, not saved.
    suggested: StatusOut
    loose: list[LooseScreen]
    #: The persona a new process starts with.
    default_persona: str
    #: Every saved process in use, A–Z (the Add to process menu; the list itself is paged).
    targets: list[TargetOut] = []


def _evidence(ref: str | None) -> str | None:
    return f"/evidence/{ref}" if ref else None


def _row(r: queries_processes.ProcessRow) -> ProcessRowOut:
    p = r.process
    return ProcessRowOut(
        id=p.id,
        key=p.key,
        name=p.name,
        persona=p.persona,
        rev=p.rev,
        stage=status_out("stage", p.stage),
        start_route=r.start_route,
        end_route=r.end_route,
        models=[
            ModelOut(
                label=label,
                kind=kind.replace("_", "-"),
                rev=rev,
                draft=status_out("process_model", "draft") if drafts else None,
            )
            for label, kind, rev, drafts in r.models
        ],
        live=[
            LiveOut(environment=env, status=status_out("process_model", "live"), what=what)
            for env, what in r.live.items()
        ],
        screens=r.screens,
        amendments=r.amendments,
        last_by=r.last_by,
        last_at=r.last_at,
    )


def _not_saved() -> StatusOut:
    s = status_out("confidence", "inferred")
    return StatusOut(shape=s.shape, word=f"{s.word} · not saved")


def _routes(steps: Any) -> list[str]:
    return [str(s.get("route") or "") for s in steps or [] if isinstance(s, dict)]


def process_list(
    conn: sqlite3.Connection, portal: str, archived: bool, page: str | None
) -> ProcessList:
    """Screen 04 for one portal: its processes (or the archived ones), one page at a time, the
    assistant's open suggestions and the screens in no process."""
    paged = pager.paginate(
        queries_processes.portal_processes(conn, portal, archived=archived),
        pager.page_number(page),
    )
    # a screen in a process's scope (off the observed path) is in a process (designer T-05)
    scoped = queries_process_scope.scoped_states(conn, portal)
    loose = [s for s in queries_processes.loose_screens(conn, portal) if s.id not in scoped]
    pictures = queries_process_doc.pictures(conn, [s.id for s in loose])
    facts = queries_process_scope.loose_facts(conn, [s.id for s in loose])
    return ProcessList(
        portal=portal,
        archived=archived,
        archived_count=queries_processes.archived_count(conn, portal),
        page=paged.page,
        pages=paged.pages,
        total=paged.total,
        stages=[status_out("stage", s) for s in ("suggested", *queries_processes.STAGES)],
        rows=[_row(r) for r in paged.items],
        suggestions=[
            SuggestionOut(
                id=s.id, name=s.name, persona=s.persona, routes=_routes(s.steps), why=s.why
            )
            for s in queries_processes.open_suggestions(conn, portal)
        ],
        loose=[
            LooseScreen(
                state=s.id,
                title=s.title,
                route=s.route_template,
                shot=_evidence(pictures[s.id].shot),
                wire=_evidence(pictures[s.id].wire),
                scans=pictures[s.id].scans,
                **facts.get(s.id, {}),
            )
            for s in loose
        ],
        suggested=_not_saved(),
        default_persona="guest",
        targets=[
            TargetOut(
                id=t.id, key=t.key, name=t.name, persona=t.persona, steps=t.steps, states=t.states
            )
            for t in queries_process_scope.targets(conn, portal)
        ],
    )
