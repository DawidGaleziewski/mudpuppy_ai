"""What changed (spec 039 T100, designer screens v2-02 and v2-03, UX-R10–R14): the portal
model's changes in a range of model versions, grouped by process and screen, and one change's
Before / after."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from .. import db
from ..queries_change_detail import change_detail
from ..queries_changes import KIND_WORDS, changes_view
from ..queries_releases import timeline
from .deps import web_of

router = APIRouter()


@router.get("/changes", response_class=HTMLResponse)
def changes_page(
    request: Request,
    env: str | None = None,
    from_seq: int = 0,
    to_seq: int | None = None,
    show: str = "all",
    kind: str | None = None,
    process: str | None = None,
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            v = changes_view(
                conn,
                c.portal,
                from_seq=from_seq,
                to_seq=to_seq,
                show=show,
                kind=kind or None,
                process=process or None,
            )
            built = {x.seq: x.built_at for x in v.versions}
            tl = None
            if c.portal and v.latest_seq is not None:
                tl = timeline(conn, c.portal, built.get(from_seq), built.get(v.to_seq or 0))
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(
        c, "salvage/changes.html", nav_current="changes", v=v, tl=tl, kinds=KIND_WORDS
    )


@router.get("/changes/{deviation_id}", response_class=HTMLResponse)
def change_page(request: Request, deviation_id: str, env: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            d = change_detail(conn, c.portal, deviation_id) if c.portal else None
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(
        c,
        "salvage/change.html",
        status_code=200 if d else 404,
        nav_current="changes",
        d=d,
        deviation_id=deviation_id,
    )
