"""The Screens section list and the header search (spec 022 M1, FE-N01, FE-N03). New pages:
Salvage Yard only, no Console version."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from .. import db, queries_screens
from .deps import web_of

router = APIRouter()


@router.get("/screens", response_class=HTMLResponse)
def screens_page(request: Request, env: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            rows = queries_screens.portal_screens(conn, c.portal)
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(c, "salvage/screens.html", nav_current="screens", rows=rows)


@router.get("/search", response_class=HTMLResponse)
def search_page(request: Request, env: str | None = None, q: str = "") -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            results = queries_screens.search(conn, q, c.portal)
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(c, "salvage/search.html", results=results, search_query=q)
