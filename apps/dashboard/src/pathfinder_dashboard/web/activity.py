"""Server activity: calls that belong to no run (FR-016), and its live region."""

from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from .. import db, queries
from .deps import Ctx, web_of

router = APIRouter()


def activity_values(c: Ctx, conn: sqlite3.Connection, params: Any) -> dict[str, Any]:
    """Values for `/activity` / `/fragments/activity`: run-less calls, newest first (FR-016)."""
    limit = c.settings.page_size
    cursor = params.get("cursor") or None
    page_no = max(int(params.get("page", "1") or 1), 1)
    result = queries.server_activity(conn, cursor=cursor, limit=limit)
    page_arg = page_no if cursor else None
    return {
        "page": result,
        "page_no": page_no,
        "pages": max(1, -(-result.total // limit)),
        "offset": (page_no - 1) * limit,
        "self_url": c.url("/fragments/activity", cursor=cursor, page=page_arg),
        "page_url": c.url("/activity", cursor=cursor, page=page_arg),
        "fragment_url": "/fragments/activity",
        "form_action": "/activity",
        "next_url": c.url("/activity", cursor=result.next_cursor, page=page_no + 1)
        if result.next_cursor
        else None,
        "next_fragment": c.url(
            "/fragments/activity", cursor=result.next_cursor, page=page_no + 1, push=1
        )
        if result.next_cursor
        else None,
        "first_url": c.url("/activity") if cursor else None,
        "first_fragment": c.url("/fragments/activity", push=1) if cursor else None,
    }


@router.get("/activity", response_class=HTMLResponse)
def activity(request: Request, env: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            return web.render(
                c,
                "activity.html",
                nav_current="activity",
                activity=activity_values(c, conn, request.query_params),
            )
    except db.StoreMissing as err:
        return web.missing(c, err)


@router.get("/fragments/activity", response_class=HTMLResponse)
def fragment_activity(request: Request, env: str | None = None, push: bool = False) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            values = activity_values(c, conn, request.query_params)
            return web.render(
                c,
                "partials/activity_rows.html",
                activity=values,
                push=values["page_url"] if push else None,
            )
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)
