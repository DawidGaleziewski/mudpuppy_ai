"""What changed (spec 039 T100, designer screens v2-02 and v2-03, UX-R10–R14): the portal
model's changes in a range of model versions, grouped by process and screen, and one change's
Before / after."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from .. import db, visuals
from ..queries_change_detail import change_detail
from ..queries_changes import KIND_WORDS, changes_view, range_from
from ..queries_releases import timeline
from .deps import web_of

router = APIRouter()


@router.get("/changes", response_class=HTMLResponse)
def changes_page(
    request: Request,
    env: str | None = None,
    from_seq: str | None = None,
    to_seq: int | None = None,
    from_date: str | None = None,
    from_scan: str | None = None,
    show: str = "all",
    kind: str | None = None,
    process: str | None = None,
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    seq = int(from_seq) if from_seq and from_seq.isdigit() else None  # "": the previous release
    try:
        with c.conn() as conn:
            start, how = range_from(conn, c.portal, seq, from_date or None, from_scan or None)
            v = changes_view(
                conn,
                c.portal,
                from_seq=start,
                to_seq=to_seq,
                show=show,
                kind=kind or None,
                process=process or None,
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


@router.get("/changes/{deviation_id}", response_class=HTMLResponse)
def change_page(
    request: Request,
    deviation_id: str,
    env: str | None = None,
    mode: str = "side",
    note: str | None = None,
    undo: str | None = None,
) -> HTMLResponse:
    """Before / after (v2-03, 12-v2-ux § 6): `mode` Side by side · Overlay · Wireframe; the
    changed element outlined on the side that has it; the decision bar posts through Review."""
    web = web_of(request)
    c = web.ctx(request, env)
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
