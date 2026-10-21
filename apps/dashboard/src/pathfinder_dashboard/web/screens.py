"""The Screens section list and the header search (spec 022 M1, FE-N01, FE-N03). New pages:
Salvage Yard only, no Console version."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from .. import db, pager, queries_model_screens, queries_screens, queries_suites
from .deps import build_url, web_of

router = APIRouter()


@router.get("/screens", response_class=HTMLResponse)
def screens_page(
    request: Request,
    env: str | None = None,
    q: str = "",
    page: str | None = None,
    status: str | None = None,
    process: str | None = None,
    recorded: bool = False,
) -> HTMLResponse:
    """A portal with a model lists the model's screens (spec 039 T100, v2-06); `recorded=1`, a
    portal without a model, or all portals list the recorded pages, 25 a page (R-71). `q`
    filters by key, title or route."""
    web = web_of(request)
    c = web.ctx(request, env)
    q = q.strip()
    try:
        with c.conn() as conn:
            counts = queries_model_screens.status_counts(conn, c.portal) if c.portal else {}
            if counts and not recorded:
                rows = queries_model_screens.model_screens(
                    conn, c.portal, status or None, q, process or None
                )
                return web.render(
                    c,
                    "salvage/model_screens.html",
                    nav_current="screens",
                    rows=rows,
                    counts=counts,
                    status=status,
                    q=q,
                    process=process,
                )
            paged = pager.paged_from_count(
                queries_screens.count_screens(conn, c.portal, q),
                pager.page_number(page),
                lambda limit, offset: queries_screens.portal_screens(
                    conn, c.portal, q, limit, offset
                ),
            )
            coverage = queries_suites.step_coverage(conn, c.portal)
            total = queries_screens.count_screens(conn, c.portal) if q else paged.total
    except db.StoreMissing as err:
        return web.missing(c, err)
    here = build_url("/screens", q=q, page=paged.page if paged.page > 1 else None)
    return web.render(
        c,
        "salvage/screens.html",
        nav_current="screens",
        rows=paged.items,
        pages=pager.links(paged, lambda n: c.url("/screens", q=q, page=n)),
        q=q,
        total=total,
        list_url=here,
        coverage=coverage,
        steps=queries_suites.step_summary(coverage),
    )


@router.get("/screens/{key}", response_class=HTMLResponse)
def screen_page(request: Request, key: str, env: str | None = None) -> HTMLResponse:
    """One screen of the portal model (spec 039 T100, v2-07)."""
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            d = queries_model_screens.screen_detail(conn, c.portal, key) if c.portal else None
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(
        c,
        "salvage/model_screen.html",
        status_code=200 if d else 404,
        nav_current="screens",
        d=d,
        key=key,
    )


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
