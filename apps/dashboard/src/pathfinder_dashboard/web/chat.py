"""Chat (spec 010, R-30; contracts/chat-http-api.md). History and the step tracker come from the
read-only store. Sending and streaming go through the local chat service, called from here only:
the browser never reaches it."""

from __future__ import annotations

import json
import re
from collections.abc import AsyncIterable
from typing import Annotated, Any
from urllib.parse import quote

import httpx2
from fastapi import APIRouter, Header, Request
from fastapi.responses import (
    HTMLResponse,
    JSONResponse,
    PlainTextResponse,
    RedirectResponse,
    Response,
    StreamingResponse,
)

from .. import chat_client, db, queries_chat
from .chat_forward import (
    chat_down,
    chat_json,
    chat_refused,
    forward,
    invalid,
    read_json,
)
from .deps import same_origin, web_of
from .views_chat import chat_values, map_values, tools_values

router = APIRouter()

ERR_REF = re.compile(r"^ERR-[A-Za-z0-9-]{1,64}$")


@router.get("/chat", response_class=HTMLResponse)
async def chat_page(
    request: Request, env: str | None = None, conversation: str | None = None
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    up = await chat_client.service_up(web.settings, web.chat_transport)
    try:
        with c.conn() as conn:
            values = chat_values(c, conn, conversation)
            if values and values.get("conversation"):
                values.update(
                    tools_values(c, conn, values["conversation"], values["tracker"].portal_id)
                )
                values.update(map_values(c, conn, values))
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(
        c,
        "chat.html",
        status_code=200 if values is not None else 404,
        nav_current="chat",
        service_up=up,
        asked=conversation,
        **(values or {"conversation": None}),
    )


@router.get("/fragments/chat/messages", response_class=HTMLResponse)
def fragment_chat_messages(
    request: Request, env: str | None = None, conversation: str | None = None
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            values = chat_values(c, conn, conversation)
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)
    if values is None:
        return web.render(c, "partials/chat_missing.html", status_code=404, asked=conversation)
    return web.render(c, "partials/chat_messages.html", **values)


@router.get("/fragments/chat/tracker", response_class=HTMLResponse)
def fragment_chat_tracker(
    request: Request, env: str | None = None, conversation: str | None = None
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            values = chat_values(c, conn, conversation)
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)
    if values is None:
        return web.render(c, "partials/chat_missing.html", status_code=404, asked=conversation)
    return web.render(c, "partials/chat_tracker.html", **values)


@router.get("/fragments/chat/progress", response_class=HTMLResponse)
def fragment_chat_progress(
    request: Request, env: str | None = None, conversation: str | None = None
) -> HTMLResponse:
    """T047: counters and activity feed of the conversation's run."""
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            values = chat_values(c, conn, conversation)
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)
    if values is None or not values.get("conversation"):
        return web.render(c, "partials/chat_missing.html", status_code=404, asked=conversation)
    return web.render(c, "partials/chat_progress.html", **values)


@router.get("/fragments/chat/map", response_class=HTMLResponse, response_model=None)
def fragment_chat_map(
    request: Request,
    env: str | None = None,
    conversation: str | None = None,
    v: str | None = None,
) -> HTMLResponse | Response:
    """T049: polled every 3 s while the run runs; 204 (htmx keeps the drawing) if unchanged."""
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            values = chat_values(c, conn, conversation)
            if values and values.get("conversation"):
                values.update(map_values(c, conn, values))
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)
    if values is None or not values.get("conversation"):
        return web.render(c, "partials/chat_missing.html", status_code=404, asked=conversation)
    if v and v == values["map_version"]:
        return Response(status_code=204)
    return web.render(c, "partials/chat_map.html", **values)


@router.get("/fragments/chat/tools", response_class=HTMLResponse)
def fragment_chat_tools(
    request: Request, env: str | None = None, conversation: str | None = None
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            values = chat_values(c, conn, conversation)
            if values and values.get("conversation"):
                values.update(
                    tools_values(c, conn, values["conversation"], values["tracker"].portal_id)
                )
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)
    if values is None or not values.get("conversation"):
        return web.render(c, "partials/chat_missing.html", status_code=404, asked=conversation)
    return web.render(c, "partials/chat_tools.html", **values)


@router.post("/chat/new")
async def chat_new(request: Request, env: str | None = None) -> Response:
    """The "new conversation" button (a plain form post, so it works without JavaScript)."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    # Spec 011: a new conversation is for the portal chosen in the header (always a new one).
    payload = {"portal": c.portal, "fresh": True} if c.portal else {}
    try:
        status, body = await chat_client.call(
            web.settings, "POST", "/conversations", payload, web.chat_transport
        )
    except chat_client.ChatUnavailable:
        return RedirectResponse(c.url("/chat"), status_code=303)
    new_id = body.get("id") if isinstance(body, dict) else None
    if status >= 300 or not isinstance(new_id, str):
        return RedirectResponse(c.url("/chat"), status_code=303)
    return RedirectResponse(c.url("/chat", conversation=new_id), status_code=303)


@router.post("/chat/conversations")
async def chat_create(request: Request) -> JSONResponse:
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    try:
        payload = await request.json()
    except ValueError:
        payload = {}
    fields = payload if isinstance(payload, dict) else {}
    sent = {k: v for k, v in fields.items() if k in ("portal", "goal") and isinstance(v, str)}
    try:
        status, body = await chat_client.call(
            web.settings, "POST", "/conversations", sent, web.chat_transport
        )
    except chat_client.ChatUnavailable:
        return chat_down()
    return chat_json(status, body)


@router.post("/chat/conversations/{conversation_id}/messages")
async def chat_send(request: Request, conversation_id: str) -> JSONResponse:
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    try:
        payload = await request.json()
    except ValueError:
        payload = {}
    text = payload.get("text") if isinstance(payload, dict) else None
    if not isinstance(text, str) or not text.strip():
        return chat_json(422, {"ref": None, "message": "Write a message first."})
    try:
        status, body = await chat_client.call(
            web.settings,
            "POST",
            f"/conversations/{quote(conversation_id, safe='')}/messages",
            {"text": text},
            web.chat_transport,
        )
    except chat_client.ChatUnavailable:
        return chat_down()
    return chat_json(status, body)


@router.get("/chat/conversations/{conversation_id}/events")
async def chat_events(
    request: Request,
    conversation_id: str,
    last_event_id: Annotated[str | None, Header()] = None,
) -> Response:
    """SSE passthrough. `Last-Event-ID` goes upstream so a reconnect resumes where it left."""
    web = web_of(request)
    client = chat_client.make_client(web.settings, web.chat_transport, stream=True)
    headers = {"accept": "text/event-stream"}
    if last_event_id:
        headers["last-event-id"] = last_event_id
    upstream_request = client.build_request(
        "GET", f"/conversations/{quote(conversation_id, safe='')}/events", headers=headers
    )
    try:
        upstream = await client.send(upstream_request, stream=True)
    except httpx2.HTTPError:
        await client.aclose()
        return chat_down()
    if upstream.status_code != 200:
        try:
            body = upstream.json() if await upstream.aread() else {}
        except ValueError:
            body = {}
        await upstream.aclose()
        await client.aclose()
        return chat_json(upstream.status_code, body)

    async def relay() -> AsyncIterable[bytes]:
        try:
            async for chunk in upstream.aiter_raw():
                yield chunk
        except httpx2.HTTPError:
            return  # the service went away; the browser's EventSource reconnects
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        relay(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.post("/chat/conversations/{conversation_id}/credentials")
async def chat_credentials(request: Request, conversation_id: str) -> JSONResponse:
    """Values go to the service and nowhere else: they are not logged, stored or echoed."""
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    fields = await read_json(request)
    portal = fields.get("portal")
    environment = fields.get("environment")
    raw = fields.get("values")
    if not isinstance(portal, str) or not portal.strip():
        return invalid("Choose a portal in the chat first.")
    if environment not in queries_chat.ENVIRONMENTS:
        return invalid("Choose sandbox, staging or production.")
    values = (
        {k: v for k, v in raw.items() if isinstance(v, str) and v != ""}
        if isinstance(raw, dict)
        else {}
    )
    if not values:
        return invalid("Type at least one value.")
    if any(not queries_chat.REF_NAME.match(k) for k in values):
        return invalid("Reference names use capital letters, digits and underscores.")
    sent = {"portal": portal, "environment": environment, "values": values}
    response = await forward(
        web, "POST", f"/conversations/{quote(conversation_id, safe='')}/credentials", sent
    )
    # Whatever the service said, only these keys go back to the browser.
    body = json.loads(response.body)
    kept = {k: body[k] for k in ("stored", "refs", "ref", "message") if k in body}
    return chat_json(response.status_code, kept)


@router.post("/chat/conversations/{conversation_id}/scope")
async def chat_scope(request: Request, conversation_id: str) -> JSONResponse:
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    fields = await read_json(request)
    text_fields = ("portal", "process_name", "persona", "start_state_id", "end_state_id")
    if not isinstance(fields.get("process_name"), str) or not fields["process_name"].strip():
        return invalid("Name the process first.")
    if any(not isinstance(fields.get(k), str) or not fields[k] for k in text_fields):
        return invalid("Choose a persona, a start state and an end state.")
    selected = fields.get("selected_state_ids")
    comments = fields.get("comments")
    sent = {
        **{k: fields[k].strip() for k in text_fields},
        "selected_state_ids": [s for s in selected if isinstance(s, str)]
        if isinstance(selected, list)
        else [],
        "comments": {
            k: v
            for k, v in (comments if isinstance(comments, dict) else {}).items()
            if isinstance(v, str) and v.strip()
        },
        "source": "ba_description",
    }
    return await forward(
        web, "POST", f"/conversations/{quote(conversation_id, safe='')}/scope", sent
    )


@router.post("/chat/runs/{run_id}/stop")
async def chat_stop_run(request: Request, run_id: str) -> JSONResponse:
    """The tracker's "Stop scan" button (T041): the run becomes interrupted, so it resumes."""
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    return await forward(web, "POST", f"/runs/{quote(run_id, safe='')}/stop", {})


@router.post("/chat/conversations/{conversation_id}/cancel")
async def chat_cancel(request: Request, conversation_id: str) -> JSONResponse:
    """The chat's [stop] (T050): ends the assistant's turn and the conversation's runs."""
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    return await forward(
        web, "POST", f"/conversations/{quote(conversation_id, safe='')}/cancel", {}
    )


@router.post("/chat/conversations/{conversation_id}/reset")
async def chat_reset(request: Request, conversation_id: str) -> JSONResponse:
    """[reset assistant] (T051): a fresh assistant session on the next message."""
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    return await forward(web, "POST", f"/conversations/{quote(conversation_id, safe='')}/reset", {})


# ---- developer lookup of an ERR- reference (T025) ----------------------------------------


@router.get("/chat/errors/{ref}", response_class=HTMLResponse)
async def chat_error(request: Request, ref: str, env: str | None = None) -> HTMLResponse:
    """The error-log line behind a reference, fetched from the service (not the store)."""
    web = web_of(request)
    c = web.ctx(request, env)
    entry: dict[str, Any] | None = None
    unavailable = False
    status = 200
    if ERR_REF.match(ref):
        try:
            code, body = await chat_client.call(
                web.settings, "GET", f"/errors/{quote(ref, safe='')}", None, web.chat_transport
            )
        except chat_client.ChatUnavailable:
            unavailable = True
        else:
            entry = body if code == 200 and isinstance(body, dict) else None
    status = 503 if unavailable else (200 if entry else 404)
    return web.render(
        c,
        "error_entry.html",
        status_code=status,
        ref=ref,
        entry=entry,
        unavailable=unavailable,
        nav_current="chat",
    )
