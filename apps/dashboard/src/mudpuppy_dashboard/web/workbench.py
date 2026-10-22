"""Workbench, the generative UI beta (spec 043; designer 14-workbench.md, screens wb-01…wb-10).
Behind `MUDPUPPY_WORKBENCH`: off hides the tab and sends `/workbench` Home with "The Workbench is
paused" (FE-W01, the kill switch). The page renders from the store; a turn and the Path switch go
through the chat service (D-2). The card and feedback actions: `workbench_actions.py`; the
stream: `workbench_stream.py`."""

from __future__ import annotations

import contextlib
import json
from html import escape
from typing import Annotated
from urllib.parse import parse_qs, quote

from fastapi import APIRouter, Query, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response
from pydantic import BaseModel

from .. import chat_client, db, queries_wb
from .deps import same_origin, web_of
from .views_workbench import (
    blocked_reason,
    chat,
    page_model,
    render_ctx,
    rendered_turns,
    tokens_for,
)

router = APIRouter()

PAUSED = "workbench-paused"


class WorkbenchQuery(BaseModel):
    """The conversation (`c`), the selected page (`sel` = `route:state`), a new conversation."""

    env: str | None = None
    c: str | None = None
    sel: str | None = None
    new: int | None = None
    ask: str | None = None  # an entry's message, filled in for the person to send (D-10)


@router.get("/workbench", response_class=HTMLResponse, response_model=None)
async def workbench_page(request: Request, q: Annotated[WorkbenchQuery, Query()]) -> Response:
    web = web_of(request)
    c = web.ctx(request, q.env)
    if not web.settings.workbench:
        return RedirectResponse(c.url("/", notice=PAUSED), 303)
    try:
        with c.conn() as conn:
            conv = queries_wb.conversation(conn, q.c) if q.c else None
            if conv is None and not q.new and c.portal:
                last = queries_wb.recent(conn, c.portal)
                conv = last[0][0] if last else None
            commands = queries_wb.commands(conn, conv.id) if conv else []
    except db.StoreMissing as err:
        return web.missing(c, err)
    tokens = await tokens_for(web, commands)
    with c.conn() as conn:
        page = page_model(c, conn, conv, q.sel, tokens)
    page.blocked = await blocked_reason(web)
    page.ask = (q.ask or "")[:200]
    return web.render(c, "workbench.html", nav_current="workbench", no_drawer=True, page=page)


async def _form(request: Request) -> dict[str, str]:
    body = (await request.body()).decode("utf-8", "replace")
    return {k: v[0] for k, v in parse_qs(body).items()}


def _ctx_chips(raw: str) -> list[object]:
    try:
        value = json.loads(raw or "[]")
    except ValueError:
        return []
    return value if isinstance(value, list) else []


@router.post("/workbench/turn", response_model=None)
async def workbench_turn(request: Request, env: str | None = None) -> Response:
    """Send (WB-UI-30): the person's message and an empty assistant message; the answer and the
    view arrive over the stream. The first message of a conversation creates it."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    form = await _form(request)
    text = form.get("text", "").strip()
    conversation_id = form.get("c", "")
    if not text:
        return HTMLResponse("", status_code=204)
    try:
        if not conversation_id:
            status, reply = await chat(
                web, "POST", "/workbench/conversations", {"portal": c.portal}
            )
            if status != 201 or not isinstance(reply, dict):
                return _line(f"Not sent: {_message(reply, status)}.")
            conversation_id = str(reply["conversation_id"])
        path = f"/workbench/conversations/{quote(conversation_id, safe='')}/turns"
        body = {"text": text, "ctx": _ctx_chips(form.get("ctx", "")), "by": web.settings.reviewer}
        status, reply = await chat(web, "POST", path, body)
    except chat_client.ChatUnavailable:
        return _line(chat_client.not_running(c.env))
    if status != 202 or not isinstance(reply, dict):
        return _line(f"Not sent: {_message(reply, status)}.")
    if not form.get("c"):
        return Response(headers={"HX-Redirect": c.url("/workbench", c=conversation_id)})
    return web.render(c, "workbench/f_pending.html", n=int(reply["turn"]), text=text)


@router.get("/workbench/turn", response_class=HTMLResponse)
async def workbench_turn_now(
    request: Request, c: str, n: int, env: str | None = None
) -> HTMLResponse:
    """A turn as the store has it now (F-16): the page asks when its answer has not arrived, so
    an answer streamed before the turn was on the page is not lost. Read-only."""
    web = web_of(request)
    ctx = web.ctx(request, env)
    with ctx.conn() as conn:
        conv = queries_wb.conversation(conn, c)
        turns = queries_wb.turns(conn, c) if conv else []
    turn = next((t for t in turns if t.n == n), None)
    if conv is None or turn is None:
        return HTMLResponse("", status_code=404)
    tokens = await tokens_for(web, turn.commands)
    with ctx.conn() as conn:
        rendered = rendered_turns(render_ctx(ctx, conn, conv, tokens), turns)
    rt = next(r for r in rendered if r.turn.n == n)
    return web.render(
        ctx, "workbench/f_turn.html", rt=rt, portal=conv.portal, page={"conversation": conv}
    )


def _message(reply: object, status: int) -> str:
    message = reply.get("message") if isinstance(reply, dict) else None
    return str(message or status).rstrip(".")


def _line(text: str) -> HTMLResponse:
    """A quiet line in the log instead of the turn (nothing red, WB-UI-31)."""
    return HTMLResponse(f'<p class="sy-small sy-muted" role="status">{escape(text)}</p>')


@router.post("/workbench/path", response_model=None)
async def workbench_path(request: Request, env: str | None = None) -> Response:
    """The Path switch (WB-UI-03): the person's choice wins until they ask for something else."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    form = await _form(request)
    conversation_id = form.get("c", "")
    path = f"/workbench/conversations/{quote(conversation_id, safe='')}/path"
    # Chat service down: the page shows the path it has; the composer says the service is down.
    with contextlib.suppress(chat_client.ChatUnavailable):
        await chat(web, "POST", path, {"path": form.get("path", "")})
    return RedirectResponse(c.url("/workbench", c=conversation_id), 303)
