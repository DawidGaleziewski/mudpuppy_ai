"""The Screens section list and the header search (spec 022 M1, FE-N01, FE-N03). New pages:
Salvage Yard only, no Console version."""

from __future__ import annotations

from dataclasses import replace
from typing import Annotated

from fastapi import APIRouter, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from .. import (
    as_of,
    db,
    pager,
    queries_model_screens,
    queries_same_screen,
    queries_screens,
    queries_suites,
)
from .deps import build_url, web_of

router = APIRouter()


class ScreensQuery(BaseModel):
    """Screens' query: the text filter and page, the model list's status, process, part, why and
    sort, and `recorded` for the recorded pages."""

    env: str | None = None
    q: str = ""
    page: str | None = None
    status: str | None = None
    process: str | None = None
    part: str | None = None
    why: str | None = None
    sort: str = "needs"
    recorded: bool = False


@router.get("/screens", response_class=HTMLResponse)
def screens_page(request: Request, s: Annotated[ScreensQuery, Query()]) -> HTMLResponse:
    """A portal with a model lists the model's screens (spec 039 T100, v2-06); `recorded=1`, a
    portal without a model, or all portals list the recorded pages, 25 a page (R-71). `q`
    filters by key, title or route; `part`, `why` and `sort` (spec 040 T017) the model list."""
    web = web_of(request)
    c = web.ctx(request, s.env)
    q, page, status, process, part, why, sort = (
        s.q.strip(),
        s.page,
        s.status,
        s.process,
        s.part,
        s.why,
        s.sort,
    )
    recorded = s.recorded
    try:
        with c.conn() as conn:
            counts = queries_model_screens.status_counts(conn, c.portal) if c.portal else {}
            if counts and not recorded:
                f = queries_model_screens.ScreenFilter(
                    status=status or None,
                    q=q,
                    process=process or None,
                    part=part or None,
                    why=why if why in queries_model_screens.WHY else None,
                    sort=sort if sort in queries_model_screens.SORTS else "needs",
                )
                every = queries_model_screens.model_screens(
                    conn, c.portal, replace(f, part=None, why=None)
                )
                return web.render(
                    c,
                    "salvage/model_screens.html",
                    nav_current="screens",
                    rows=[r for r in every if f.keeps(r)],
                    counts=counts,
                    status=status,
                    q=q,
                    process=process,
                    f=f,
                    parts=sorted({p for r in every for p in r.parts}),
                    whys=queries_model_screens.WHY,
                    sorts=queries_model_screens.SORTS,
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
            labels = queries_same_screen.screen_labels(conn, c.portal, key) if d else []
        # The As of menu offers only versions the screen is in (spec 042 F-09).
        with c.conn(now=True) as conn:
            since = as_of.first_seq(conn, c.portal, "screen", key)
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(
        c,
        "salvage/model_screen.html",
        status_code=200 if d else 404,
        nav_current="screens",
        d=d,
        key=key,
        labels=labels,
        words=queries_same_screen.WORDS,
        as_of_since=since,
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
