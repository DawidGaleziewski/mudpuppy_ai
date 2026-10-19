"""What changed (spec 039 M3, UX-R10–R13): the portal model's deviations and their explanations.
Functional Salvage Yard page until the UX designer's layout lands (T100)."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from .. import db
from ..queries_changes import changes_view
from .deps import web_of

router = APIRouter()


@router.get("/changes", response_class=HTMLResponse)
def changes_page(request: Request, env: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            v = changes_view(conn, c.portal)
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(c, "salvage/changes.html", nav_current="changes", v=v)
