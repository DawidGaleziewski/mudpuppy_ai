"""A recorded state's page (spec 008) and its TO-BE amendments region."""

from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from .. import db, queries_chat, visuals
from .deps import Ctx, web_of

router = APIRouter()


def state_amendments_values(c: Ctx, conn: sqlite3.Connection, state: Any) -> dict[str, Any]:
    """TO-BE amendments on one state, plus what its form needs (T031)."""
    return {
        "items": queries_chat.amendments_for_state(conn, state.portal_id, state.id),
        "elements": queries_chat.state_elements(c.settings.data_dir, state),
        "self_url": c.url(f"/fragments/states/{state.id}/amendments"),
    }


@router.get("/states/{state_id}", response_class=HTMLResponse)
def state_detail(
    request: Request,
    state_id: str,
    env: str | None = None,
    view: str = "screenshot",
    elements: bool = False,
) -> HTMLResponse:
    """A recorded state's screenshot, wireframe and the records citing it (spec 008)."""
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            page = visuals.state_page(conn, web.settings.data_dir, state_id)
            if page is None:
                return web.render(c, "state_not_found.html", status_code=404, state_id=state_id)
            if not page.figure.has_screenshot:
                view = "wireframe"
            return web.render(
                c,
                "state.html",
                p=page,
                am=state_amendments_values(c, conn, page.figure.state),
                view="wireframe" if view == "wireframe" else "screenshot",
                show_elements=elements,
            )
    except db.StoreMissing as err:
        return web.missing(c, err)


@router.get("/fragments/states/{state_id}/amendments", response_class=HTMLResponse)
def fragment_state_amendments(
    request: Request, state_id: str, env: str | None = None
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            page = visuals.state_page(conn, web.settings.data_dir, state_id)
            if page is None:
                return web.render(
                    c, "partials/states/state_missing.html", status_code=404, state_id=state_id
                )
            am = state_amendments_values(c, conn, page.figure.state)
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)
    return web.render(c, "partials/state_amendments.html", am=am, st=page.figure.state)
