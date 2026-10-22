"""What changed (spec 039 T100, designer screens v2-02 and v2-03, UX-R10–R14): the portal
model's changes in a range of model versions, grouped by process and screen, and one change's
Before / after."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from .. import db, visuals
from ..queries_change_detail import change_detail
from ..queries_changes import KIND_WORDS, ChangeFilter, changes_view, range_from
from ..queries_releases import timeline
from .deps import web_of

router = APIRouter()


class ChangesQuery(BaseModel):
    """The Changes page's query: the range (from a version, a date or a scan) and the filters."""

    env: str | None = None
    from_seq: str | None = None
    to_seq: int | None = None
    from_date: str | None = None
    from_scan: str | None = None
    show: str = "all"
    kind: str | None = None
    process: str | None = None


@router.get("/changes", response_class=HTMLResponse)
def changes_page(request: Request, q: Annotated[ChangesQuery, Query()]) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, q.env)
    from_date, from_scan = q.from_date, q.from_scan
    seq = int(q.from_seq) if q.from_seq and q.from_seq.isdigit() else None  # "": previous release
    try:
        with c.conn() as conn:
            start, how = range_from(conn, c.portal, seq, from_date or None, from_scan or None)
            v = changes_view(
                conn,
                c.portal,
                ChangeFilter(
                    from_seq=start,
                    to_seq=q.to_seq,
                    show=q.show,
                    kind=q.kind or None,
                    process=q.process or None,
                ),
            )
            built = {x.seq: x.built_at for x in v.versions}
            tl = None
            if c.portal and v.latest_seq is not None:
                tl = timeline(conn, c.portal, built.get(start), built.get(v.to_seq or 0))
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(
        c,
        "salvage/changes.html",
        nav_current="changes",
        v=v,
        tl=tl,
        kinds=KIND_WORDS,
        from_how=how,
        from_date=from_date or "",
        from_scan=from_scan or "",
    )


MODES = {"side": "Side by side", "overlay": "Overlay", "wire": "Wireframe"}


class ChangeQuery(BaseModel):
    """Before / after's query: the view mode and the notice of the decision just taken."""

    env: str | None = None
    mode: str = "side"
    note: str | None = None
    undo: str | None = None


@router.get("/changes/{deviation_id}", response_class=HTMLResponse)
def change_page(
    request: Request, deviation_id: str, q: Annotated[ChangeQuery, Query()]
) -> HTMLResponse:
    """Before / after (v2-03, 12-v2-ux § 6): `mode` Side by side · Overlay · Wireframe; the
    changed element outlined on the side that has it; the decision bar posts through Review."""
    web = web_of(request)
    c = web.ctx(request, q.env)
    mode, note, undo = q.mode, q.note, q.undo
    try:
        with c.conn() as conn:
            d = change_detail(conn, c.portal, deviation_id) if c.portal else None
    except db.StoreMissing as err:
        return web.missing(c, err)
    mark = None
    if d and d.marked_side and d.change.element_key:
        side = d.before if d.marked_side == "before" else d.after
        mark = visuals.region(c.data_dir, side.layout_ref, d.change.element_key)
    return web.render(
        c,
        "salvage/change.html",
        status_code=200 if d else 404,
        nav_current="changes",
        d=d,
        deviation_id=deviation_id,
        mode=mode if mode in MODES else "side",
        modes=MODES,
        mark=mark,
        note=note,
        undo=undo,
    )
