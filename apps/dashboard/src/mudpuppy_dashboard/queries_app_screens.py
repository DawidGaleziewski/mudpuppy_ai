"""The React console's Screens (R-96, spec 052; designer screens v2-06 / v2-07): the read models
`queries_model_screens` and `queries_same_screen` as typed JSON. Statuses come mapped
by the one status map; pictures come as URLs the dashboard serves."""

from __future__ import annotations

import sqlite3
from dataclasses import replace

from pydantic import BaseModel

from . import queries_model_screens as qms
from .queries_app import Chip, NeedsItem, StatusOut, needs_item, status_out
from .queries_model_screens import ScreenRow
from .queries_same_screen import WORDS, screen_labels


class ProcessRef(BaseModel):
    key: str
    name: str


class RowPictureOut(BaseModel):
    """The main variant's latest recording, for the list's row picture (designer T-03)."""

    shot: str | None
    wire: str | None


class ScreenOut(BaseModel):
    key: str
    title: str
    route: str
    status: StatusOut
    #: Changes on the screen that need a person.
    needs: int
    variants: int
    #: The distinct whys of its variants (`queries_model_screens.WHY`) as chips (Unknown dashed),
    #: the baseline left out.
    why: list[Chip]
    last_seen: str | None
    last_run: str | None
    #: Actions seen working, of `actions` (retired ones left out), on `release`.
    checked: int
    actions: int
    release: str | None
    parts: list[str]
    process: ProcessRef | None
    #: On the list only; None: nothing recorded (the row says "not recorded yet").
    picture: RowPictureOut | None = None


class Option(BaseModel):
    value: str
    label: str


class ScreenFilterOut(BaseModel):
    status: str | None
    q: str
    process: str | None
    part: str | None
    why: str | None
    sort: str


class ScreensData(BaseModel):
    portal: str
    #: False: the portal has no model yet (only recorded pages).
    has_model: bool
    counts: dict[str, int]
    filter: ScreenFilterOut
    parts: list[str]
    whys: list[str]
    sorts: list[Option]
    screens: list[ScreenOut]


def why_chip(word: str) -> Chip:
    """A variant's why as a chip: Unknown is dashed (nothing found to explain it)."""
    return Chip(word=word, variant="dashed" if word == "Unknown" else None)


def _screen(r: ScreenRow) -> ScreenOut:
    return ScreenOut(
        key=r.key,
        title=r.title,
        route=r.route,
        status=status_out("model_screen", r.status),
        needs=r.needs,
        variants=r.variants,
        why=[why_chip(w) for w in r.why],
        last_seen=r.last_seen,
        last_run=r.last_run,
        checked=r.checked,
        actions=r.actions,
        release=r.release,
        parts=r.parts,
        process=ProcessRef(key=r.process[0], name=r.process[1]) if r.process else None,
    )


def screens_data(conn: sqlite3.Connection, portal: str, f: qms.ScreenFilter) -> ScreensData:
    """The model's screens under the filter; `parts` from every screen of the status and text."""
    f = replace(
        f,
        why=f.why if f.why in qms.WHY else None,
        sort=f.sort if f.sort in qms.SORTS else "needs",
    )
    counts = qms.status_counts(conn, portal)
    every = qms.model_screens(conn, portal, replace(f, part=None, why=None)) if counts else []
    shown = [r for r in every if f.keeps(r)]
    pictures = _row_pictures(conn, portal)
    return ScreensData(
        portal=portal,
        has_model=bool(counts),
        counts=counts,
        filter=ScreenFilterOut(
            status=f.status, q=f.q, process=f.process, part=f.part, why=f.why, sort=f.sort
        ),
        parts=sorted({p for r in every for p in r.parts}),
        whys=list(qms.WHY),
        sorts=[Option(value=k, label=label) for k, label in qms.SORTS.items()],
        screens=[_screen(r).model_copy(update={"picture": pictures.get(r.key)}) for r in shown],
    )


def _row_pictures(conn: sqlite3.Connection, portal: str) -> dict[str, RowPictureOut]:
    """Each screen's main variant (its first member) and that state's latest recording."""
    found = qms.main_pictures(conn, portal)
    return {
        key: RowPictureOut(shot=_evidence(p.shot), wire=_evidence(p.wire))
        for key, p in found.items()
        if p.shot or p.wire
    }


class PictureOut(BaseModel):
    shot: str | None
    wire: str | None
    scans: int


class VariantOut(BaseModel):
    ordinal: int
    state_id: str
    title: str
    picture: PictureOut | None
    #: The why with what it names ("Release 5696", "Persona premium", "Baseline").
    reason: str
    #: The why's chip variant: dashed for Unknown.
    reason_chip: str | None
    explanation: str
    #: Of the change that brought it; Observed for the baseline.
    status: StatusOut
    first_seen: str | None
    last_seen: str | None
    visits: int
    personas: list[str]
    releases: list[str]


class Lead(BaseModel):
    #: The screen it leads to; None: no page. Equal to the screen's own key: stays inside.
    key: str | None
    title: str | None
    #: What happened instead of an ordinary move ("no change", "error"); None when it worked.
    note: str | None


class ActionOut(BaseModel):
    element_key: str
    kind: str
    status: StatusOut
    #: On every page (a menu, a footer).
    is_global: bool
    #: inside (stays on the screen or leads to no page), out (to another screen), menu (on every
    #: page): the map inspector's "Actions inside" and "Links out" (v2-08).
    place: str
    leads_to: list[Lead]


class ChangeOut(BaseModel):
    id: str
    chip: Chip
    status: StatusOut
    finding: str
    model_seq: int
    created_at: str


class LabelOut(BaseModel):
    """An answer to "same screen?" for two page versions of this screen."""

    a: str
    b: str
    answer: str
    by: str
    at: str
    reason: str | None


class ScreenDetailData(BaseModel):
    portal: str
    screen: ScreenOut
    needs: list[NeedsItem]
    variants: list[VariantOut]
    actions: list[ActionOut]
    history: list[ChangeOut]
    labels: list[LabelOut]


#: The baseline variant's status: no change brought it.
OBSERVED = StatusOut(shape="ok", word="Observed")


def _evidence(ref: str | None) -> str | None:
    return f"/evidence/{ref}" if ref else None


def _variant(v: qms.Variant) -> VariantOut:
    p = v.picture
    return VariantOut(
        ordinal=v.ordinal,
        state_id=v.state_id,
        title=v.title,
        picture=PictureOut(shot=_evidence(p.shot), wire=_evidence(p.wire), scans=p.scans)
        if p and (p.shot or p.wire)
        else None,
        reason=v.reason,
        reason_chip="dashed" if v.reason == "Unknown" else None,
        explanation=v.why.text,
        status=status_out("deviation", v.status) if v.status else OBSERVED,
        first_seen=v.first_seen,
        last_seen=v.last_seen,
        visits=v.visits,
        personas=v.personas,
        releases=v.releases,
    )


def _place(a: qms.Action, own: str) -> str:
    if a.is_global:
        return "menu"
    return "out" if any(k and k != own for k, _, _ in a.leads_to) else "inside"


def _action(a: qms.Action, own: str) -> ActionOut:
    return ActionOut(
        element_key=a.element_key,
        kind=a.kind,
        status=status_out("action", a.status),
        is_global=a.is_global,
        place=_place(a, own),
        leads_to=[
            Lead(key=k, title=t, note=None if res == "ok" else res.replace("_", " "))
            for k, t, res in a.leads_to
        ],
    )


def screen_detail_data(conn: sqlite3.Connection, portal: str, key: str) -> ScreenDetailData | None:
    d = qms.screen_detail(conn, portal, key)
    if d is None:
        return None
    return ScreenDetailData(
        portal=portal,
        screen=_screen(d.row),
        needs=[needs_item(kind, it) for kind, it in d.needs],
        variants=[_variant(v) for v in d.variants],
        actions=[_action(a, d.row.key) for a in d.actions],
        history=[
            ChangeOut(
                id=ch.id,
                chip=Chip(word=ch.word, variant=None),
                status=status_out("deviation", ch.status),
                finding=ch.finding,
                model_seq=ch.model_seq,
                created_at=ch.created_at,
            )
            for ch in d.history
        ],
        labels=[
            LabelOut(
                a=e.a,
                b=e.b,
                # in a sentence after the name ("Ola: same screen")
                answer=WORDS.get(e.label.answer, e.label.answer).lower(),
                by=e.label.by,
                at=e.label.at,
                reason=e.label.reason,
            )
            for e in screen_labels(conn, portal, key)
        ],
    )
