"""Scans ▸ By process (spec 034 R-70 (1)): which scans belong to which documented process, the
scans no process owns (unassigned, so they are not forgotten), and groups of unassigned scans that
look like one process nobody documented yet. Read-only, like every page."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from .. import db, queries_run_groups
from .deps import web_of

router = APIRouter()


@router.get("/scans/by-process", response_class=HTMLResponse)
def run_groups_page(request: Request, env: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    groups = runs = None
    try:
        with c.conn() as conn:
            if c.portal:
                inp = queries_run_groups.load_input(conn, c.portal)
                groups = queries_run_groups.group_runs(inp)
                runs = queries_run_groups.run_infos(conn, c.portal, inp)
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(
        c, "salvage/run_groups.html", nav_current="scans", groups=groups, runs=runs or {}
    )
