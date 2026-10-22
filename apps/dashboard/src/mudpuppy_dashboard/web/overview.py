"""The overview page (`/`): a picked portal's Home (spec 039 T100, v2-01), or every portal with
its live regions (portal cards and the runs table)."""

from __future__ import annotations

import sqlite3
from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel

from .. import (
    db,
    queries,
    queries_all_portals,
    queries_chat,
    queries_portal_home,
    queries_review,
)
from ..models import RUN_STATUSES
from .deps import Ctx, web_of

router = APIRouter()


def summary_values(c: Ctx, conn: sqlite3.Connection, portal: str | None) -> dict[str, Any]:
    summaries = queries.portal_summaries(conn)
    portal = portal or None
    if portal:
        summaries = [s for s in summaries if s.portal_id == portal]
    return {
        "items": summaries,
        "superseded": queries_chat.superseded_counts(conn),
        "self_url": c.url("/fragments/summary", portal=portal),
    }


class RunsQuery(BaseModel):
    """The scans list's query: portal and status filters, the keyset cursor and its page."""

    env: str | None = None
    portal: str | None = None
    status: str | None = None
    cursor: str | None = None
    page: int = 1


class RunsFragmentQuery(RunsQuery):
    """The fragment also says whether to push its URL into the history."""

    push: bool = False


def runs_values(c: Ctx, conn: sqlite3.Connection, q: RunsQuery) -> dict[str, Any]:
    limit = c.settings.page_size
    portal = q.portal or None  # a form's "any" option submits an empty string
    status = q.status if q.status in RUN_STATUSES else None
    cursor = q.cursor or None
    page = q.page
    result = queries.list_runs(conn, portal=portal, status=status, cursor=cursor, limit=limit)
    filters = {"portal": portal, "status": status}
    page = max(page, 1)
    return {
        "page": result,
        "filters": filters,
        "portals": queries.portals(conn),
        "page_no": page,
        "pages": max(1, -(-result.total // limit)),
        "offset": (page - 1) * limit,
        "self_url": c.url(
            "/fragments/runs", **filters, cursor=cursor, page=page if cursor else None
        ),
        "page_url": c.url("/", **filters, cursor=cursor, page=page if cursor else None),
        "fragment_url": "/fragments/runs",
        "form_action": "/",
        "next_url": c.url("/", **filters, cursor=result.next_cursor, page=page + 1)
        if result.next_cursor
        else None,
        "next_fragment": c.url(
            "/fragments/runs", **filters, cursor=result.next_cursor, page=page + 1, push=1
        )
        if result.next_cursor
        else None,
        "first_url": c.url("/", **filters) if cursor else None,
        "first_fragment": c.url("/fragments/runs", **filters, push=1) if cursor else None,
    }


@router.get("/", response_class=HTMLResponse, response_model=None)
def overview(request: Request, q: Annotated[RunsQuery, Query()]) -> Response:
    web = web_of(request)
    c = web.ctx(request, q.env)
    portal = q.portal if q.portal is not None else c.portal  # spec 011: the header's choice
    try:
        with c.conn() as conn:
            # Spec 039 T100 (v2-01): Home for a picked portal is its overview; the assistant is
            # beside it (the drawer, Ctrl J) and on /chat.
            if portal:
                home = queries_portal_home.portal_home(conn, portal)
                return web.render(
                    c,
                    "salvage/home.html",
                    nav_current="home",
                    h=home,
                    queries_kinds=queries_review.KINDS,
                )
            # Spec 040 T020 (v2-15): All portals leads with the portals plate and Review's
            # preview across portals; the machine's cards and the scans stay below.
            every = queries_all_portals.all_portals(
                conn, queries_chat.known_portals(conn, web.settings.portals_dir)
            )
            return web.render(
                c,
                "overview.html",
                summary=summary_values(c, conn, portal),
                runs=runs_values(c, conn, q.model_copy(update={"portal": portal})),
                every=every,
            )
    except db.StoreMissing as err:
        return web.missing(c, err)


@router.get("/fragments/summary", response_class=HTMLResponse)
def fragment_summary(
    request: Request, env: str | None = None, portal: str | None = None
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            return web.render(
                c, "partials/portal_cards.html", summary=summary_values(c, conn, portal)
            )
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)


@router.get("/fragments/runs", response_class=HTMLResponse)
def fragment_runs(request: Request, q: Annotated[RunsFragmentQuery, Query()]) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, q.env)
    try:
        with c.conn() as conn:
            values = runs_values(c, conn, q)
            return web.render(
                c,
                "partials/runs_table.html",
                runs=values,
                push=values["page_url"] if q.push else None,
            )
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)
