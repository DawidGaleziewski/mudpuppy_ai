"""Access by persona (spec 024 US2): which personas reached each screen of the chosen portal and
which screens depend on who is looking. Salvage Yard only. The matrix is a live region."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from .. import db
from .deps import web_of
from .views_access import matrix_values

router = APIRouter()


@router.get("/access", response_class=HTMLResponse)
def access_page(request: Request, env: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            v = matrix_values(web, c, conn)
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(c, "salvage/access.html", nav_current="access", v=v)


@router.get("/fragments/access", response_class=HTMLResponse)
def fragment_access(request: Request, env: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            v = matrix_values(web, c, conn)
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)
    return web.render(c, "salvage/partials/access_matrix.html", v=v)
