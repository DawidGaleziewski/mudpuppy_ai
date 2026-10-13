"""A recorded state's page (spec 008) and its TO-BE amendments region."""

from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from .. import db, queries_chat, queries_revisions, queries_screens, queries_urls, visuals
from .deps import Ctx, web_of

router = APIRouter()


SIDE_TABS = ("amendments", "cited", "history")


def state_amendments_values(c: Ctx, conn: sqlite3.Connection, state: Any) -> dict[str, Any]:
    """TO-BE amendments on the screen (every revision, spec 022 T032), each with its revision
    history, plus what the add form needs (T031)."""
    items = queries_chat.amendments_for_screen(conn, state.portal_id, state.id, state.screen_id)
    return {
        "items": items,
        "history": {a.id: queries_revisions.amendment_history(conn, a.id) for a in items},
        "elements": queries_chat.state_elements(c.data_dir, state),
        "state_id": state.id,
        "self_url": c.url(f"/fragments/states/{state.id}/amendments"),
    }


def amendment_pins(page: visuals.StatePage, items: list[Any]) -> list[visuals.Highlight]:
    """One mark per active amendment on an element of this revision, labelled with its key."""
    boxes = {e.key: e for e in page.elements}
    state_id = page.figure.state.id
    pins = []
    for a in items:
        sid, _, key = a.target_id.partition("#")
        if a.status == "active" and a.target_kind == "wireframe_element" and sid == state_id:
            box = boxes.get(key)
            if box is not None:
                pins.append(box.model_copy(update={"n": len(pins) + 1, "note": a.key}))
    return pins


@router.get("/states/{state_id}", response_class=HTMLResponse)
def state_detail(
    request: Request,
    state_id: str,
    env: str | None = None,
    view: str = "screenshot",
    elements: bool = False,
    hl: str | None = None,
    side: str = "amendments",
    pins: bool = True,
) -> HTMLResponse:
    """A recorded state's screenshot, wireframe and the records citing it (spec 008), as one
    observed revision of its screen (spec 022 screen 08). `hl` is the assistant's highlight
    (FE-A07): that element is marked "Marked by assistant"; an empty value marks the whole
    screen. `side` picks the side pane's tab; `pins` shows the amendments on the screenshot."""
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            page = visuals.state_page(conn, c.data_dir, state_id)
            if page is None:
                return web.render(c, "state_not_found.html", status_code=404, state_id=state_id)
            if not page.figure.has_screenshot:
                view = "wireframe"
            am = state_amendments_values(c, conn, page.figure.state)
            return web.render(
                c,
                "state.html",
                p=page,
                urls=queries_urls.state_urls(conn, state_id),
                am=am,
                screen=queries_revisions.screen_of_state(conn, state_id),
                processes=queries_screens.processes_of_state(conn, state_id),
                view="wireframe" if view == "wireframe" else "screenshot",
                show_elements=elements,
                assistant_hl=hl,
                marked=[e for e in page.elements if e.key == hl] if hl else [],
                pins=amendment_pins(page, am["items"]) if pins else None,
                side=side if side in SIDE_TABS else "amendments",
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
            page = visuals.state_page(conn, c.data_dir, state_id)
            if page is None:
                return web.render(
                    c, "partials/states/state_missing.html", status_code=404, state_id=state_id
                )
            am = state_amendments_values(c, conn, page.figure.state)
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)
    return web.render(c, "partials/state_amendments.html", am=am, st=page.figure.state)
