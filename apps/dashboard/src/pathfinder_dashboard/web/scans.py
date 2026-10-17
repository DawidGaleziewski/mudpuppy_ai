"""Scans (spec 022 screen 10, T030): the live monitor of the chosen portal's running scan, the
history with what each scan changed. New page: Salvage Yard only. Server activity stays at
`/activity` and is linked as the second tab. The monitor is a live region: it follows store
commits like every other region (no endpoint of its own)."""

from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from .. import db, pager, queries_scans
from .deps import Ctx, web_of

router = APIRouter()


def scans_values(c: Ctx, conn: sqlite3.Connection, page: str | None = None) -> dict[str, Any]:
    portal = c.portal
    if not portal:
        return {"portal": None, "monitors": [], "history": [], "counts": None, "pages": None}
    monitors = queries_scans.monitor(conn, portal)
    paged = pager.paged_from_count(
        queries_scans.count_runs(conn, portal),
        pager.page_number(page),
        lambda limit, offset: queries_scans.history(conn, portal, limit, offset),
    )
    shown = paged.page if paged.page > 1 else None
    return {
        "portal": portal,
        "monitors": monitors,
        "history": paged.items,
        "pages": pager.links(paged, lambda n: c.url("/scans", page=n)),
        "counts": queries_scans.counts(conn, portal),
        "self_url": c.url("/fragments/scans", page=shown),
    }


@router.get("/scans", response_class=HTMLResponse)
def scans_page(request: Request, env: str | None = None, page: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            v = scans_values(c, conn, page)
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(c, "salvage/scans.html", nav_current="scans", v=v)


@router.get("/fragments/scans", response_class=HTMLResponse)
def fragment_scans(
    request: Request, env: str | None = None, page: str | None = None
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            v = scans_values(c, conn, page)
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)
    return web.render(c, "salvage/partials/scans_body.html", v=v)
