"""A recorded state's page (spec 008) and its TO-BE amendments region."""

from __future__ import annotations

import sqlite3
from typing import Any
from urllib.parse import parse_qs, quote, urlencode

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response

from .. import (
    chat_client,
    db,
    neighbours,
    queries_chat,
    queries_map_node,
    queries_revisions,
    queries_screens,
    queries_suites,
    queries_urls,
    visuals,
)
from . import views_access
from .deps import Ctx, same_origin, web_of

router = APIRouter()


SIDE_TABS = ("amendments", "cited", "history", "access")


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
    probe_note: str | None = None,
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
                ac=views_access.screen_values(web, c, conn, page.figure.state),
                screen=queries_revisions.screen_of_state(conn, state_id),
                processes=queries_screens.processes_of_state(conn, state_id),
                fs=queries_suites.form_step_of_state(conn, state_id),
                probe_note=probe_note,
                can_mark=bool(web.settings.reviewer),
                view="wireframe" if view == "wireframe" else "screenshot",
                show_elements=elements,
                assistant_hl=hl,
                marked=[e for e in page.elements if e.key == hl] if hl else [],
                pins=amendment_pins(page, am["items"]) if pins else None,
                side=side if side in SIDE_TABS else "amendments",
                nb=neighbours.neighbours(
                    conn, c.portal, request.query_params.get("list"), state_id, c.url
                ),
            )
    except db.StoreMissing as err:
        return web.missing(c, err)


@router.get("/fragments/states/{state_id}/access", response_class=HTMLResponse)
def fragment_state_access(request: Request, state_id: str, env: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            page = visuals.state_page(conn, c.data_dir, state_id)
            if page is None:
                return web.render(
                    c, "partials/states/state_missing.html", status_code=404, state_id=state_id
                )
            ac = views_access.screen_values(web, c, conn, page.figure.state)
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)
    return web.render(c, "partials/state_access.html", ac=ac)


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


PROBE_MARK_DONE = {
    "mark": "Marked for probing. Ask the assistant to probe the marked forms.",
    "remove": "Probe mark removed.",
}


async def _mark_call(
    web: Any, env: str, method: str, portal: str, body: dict[str, Any]
) -> str | None:
    """One chat service call on the portal's marks; the refusal's message, or None."""
    path = f"/portals/{quote(portal, safe='')}/marks"
    try:
        status, answer = await chat_client.call(
            web.settings, method, path, body, web.chat_transport
        )
    except chat_client.ChatUnavailable:
        return chat_client.not_running(env)
    if status in (200, 201):
        return None
    message = answer.get("message") if isinstance(answer, dict) else None
    return str(message or status)


SCREEN_MARK_KINDS = {kind: label for kind, label, _ in queries_map_node.SCREEN_MARKS}


@router.post("/states/{state_id}/mark", response_model=None)
async def state_mark(request: Request, state_id: str, env: str | None = None) -> Response:
    """Set or remove a Start here / Focus / Recheck / Retry / Skip mark on a screen state (spec 034
    R-66, design §6) through the chat service; back to the map (or the screen page)."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    form = parse_qs((await request.body()).decode("utf-8", "replace"))
    kind = (form.get("kind") or [""])[0]
    action = (form.get("action") or [""])[0]
    try:
        with c.conn() as conn:
            portal = queries_screens.portal_of_state(conn, state_id)
    except db.StoreMissing as err:
        return web.missing(c, err)
    if not web.settings.reviewer:
        note = "Set PATHFINDER_REVIEWER to your name to mark screens."
    elif portal is None or kind not in SCREEN_MARK_KINDS or action not in ("mark", "remove"):
        note = "Unknown mark, action or screen."
    else:
        body = {
            "author": web.settings.reviewer,
            "kind": kind,
            "target_kind": "state",
            "target_id": state_id,
        }
        method = "POST" if action == "mark" else "DELETE"
        refused = await _mark_call(web, c.env, method, portal, body)
        label = SCREEN_MARK_KINDS[kind]
        done = f"Marked {label}." if action == "mark" else f"{label} mark removed."
        note = f"Not recorded: {refused}." if refused else done
    back = (form.get("back") or [""])[0]
    if back.startswith("/map?") or back == "/map":
        sep = "&" if "?" in back else "?"
        return RedirectResponse(f"{back}{sep}{urlencode({'probe_note': note})}", status_code=303)
    if back.startswith("/runs/"):  # a scan's graph (spec 035): its note shows above the graph
        sep = "&" if "?" in back else "?"
        return RedirectResponse(f"{back}{sep}{urlencode({'note': note})}", status_code=303)
    return RedirectResponse(c.url(f"/states/{state_id}", probe_note=note), status_code=303)


@router.post("/states/{state_id}/probe-mark", response_model=None)
async def state_probe_mark(request: Request, state_id: str, env: str | None = None) -> Response:
    """Mark the state's form step for probing, or remove the mark (spec 032 US5), through the
    chat service (the dashboard never writes); back to the screen page with the outcome."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    form = parse_qs((await request.body()).decode("utf-8", "replace"))
    action = (form.get("action") or [""])[0]
    author = web.settings.reviewer
    try:
        with c.conn() as conn:
            fs = queries_suites.form_step_of_state(conn, state_id)
    except db.StoreMissing as err:
        return web.missing(c, err)
    if not author:
        note = "Set PATHFINDER_REVIEWER to your name to mark form steps."
    elif fs is None or action not in PROBE_MARK_DONE:
        note = "Unknown action, or this screen is no form step."
    else:
        body = {"author": author, "kind": "probe", "target_kind": "form_step", "target_id": fs.id}
        method = "POST" if action == "mark" else "DELETE"
        refused = await _mark_call(web, c.env, method, fs.portal, body)
        note = f"Not recorded: {refused}." if refused else PROBE_MARK_DONE[action]
    # The map's inspector sends `back` (spec 033 FR-011); only a map address is followed.
    back = (form.get("back") or [""])[0]
    if back.startswith("/map?") or back == "/map":
        sep = "&" if "?" in back else "?"
        return RedirectResponse(f"{back}{sep}{urlencode({'probe_note': note})}", status_code=303)
    target = c.url(f"/states/{state_id}", probe_note=note)
    return RedirectResponse(target + "#h-form-step", status_code=303)
