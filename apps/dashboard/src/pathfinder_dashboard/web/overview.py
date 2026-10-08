"""The overview page (`/`) and the live regions it serves: portal cards and the runs table."""

from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from .. import db, queries, queries_chat
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


def runs_values(
    c: Ctx,
    conn: sqlite3.Connection,
    portal: str | None,
    status: str | None,
    cursor: str | None,
    page: int,
) -> dict[str, Any]:
    limit = c.settings.page_size
    portal = portal or None  # a form's "any" option submits an empty string
    status = status if status in RUN_STATUSES else None
    cursor = cursor or None
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


@router.get("/", response_class=HTMLResponse)
def overview(
    request: Request,
    env: str | None = None,
    portal: str | None = None,
    status: str | None = None,
    cursor: str | None = None,
    page: int = 1,
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    portal = portal if portal is not None else c.portal  # spec 011: the header's choice
    try:
        with c.conn() as conn:
            return web.render(
                c,
                "overview.html",
                summary=summary_values(c, conn, portal),
                runs=runs_values(c, conn, portal, status, cursor, page),
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
def fragment_runs(
    request: Request,
    env: str | None = None,
    portal: str | None = None,
    status: str | None = None,
    cursor: str | None = None,
    page: int = 1,
    push: bool = False,
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            values = runs_values(c, conn, portal, status, cursor, page)
            return web.render(
                c,
                "partials/runs_table.html",
                runs=values,
                push=values["page_url"] if push else None,
            )
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)
