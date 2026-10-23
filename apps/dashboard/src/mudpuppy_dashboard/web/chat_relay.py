"""The chat relay (spec 010, R-30; contracts/chat-http-api.md): the React console's assistant and
Workbench reach the local chat service through these calls only, never directly. JSON in and out,
and the conversation's event stream passed through."""

from __future__ import annotations

import json
from collections.abc import AsyncIterable
from typing import Annotated, Any
from urllib.parse import quote

import httpx2
from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from .. import chat_client, queries_chat
from .chat_forward import chat_down, chat_json, chat_refused, forward, invalid, read_json
from .deps import same_origin, web_of

router = APIRouter(prefix="/chat/conversations")


def _path(conversation_id: str, *rest: str) -> str:
    return "/".join(("/conversations", quote(conversation_id, safe=""), *rest))


@router.post("")
async def create(request: Request) -> JSONResponse:
    """A conversation for a portal (and a goal)."""
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    fields = await read_json(request)
    sent = {k: v for k, v in fields.items() if k in ("portal", "goal") and isinstance(v, str)}
    try:
        status, body = await chat_client.call(
            web.settings, "POST", "/conversations", sent, web.chat_transport
        )
    except chat_client.ChatUnavailable:
        return chat_down(web)
    return chat_json(status, body)


@router.post("/{conversation_id}/messages")
async def send(request: Request, conversation_id: str) -> JSONResponse:
    """A message, with "This page" or "Whole yard" as its context (spec 022 FE-A03)."""
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    fields = await read_json(request)
    text = fields.get("text")
    if not isinstance(text, str) or not text.strip():
        return chat_json(422, {"ref": None, "message": "Write a message first."})
    sent: dict[str, Any] = {"text": text}
    if isinstance(fields.get("context"), dict):
        sent["context"] = fields["context"]
    try:
        status, body = await chat_client.call(
            web.settings, "POST", _path(conversation_id, "messages"), sent, web.chat_transport
        )
    except chat_client.ChatUnavailable:
        return chat_down(web)
    return chat_json(status, body)


@router.get("/{conversation_id}/events")
async def events(
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
        "GET", _path(conversation_id, "events"), headers=headers
    )
    try:
        upstream = await client.send(upstream_request, stream=True)
    except httpx2.HTTPError:
        await client.aclose()
        return chat_down(web)
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


@router.post("/{conversation_id}/credentials")
async def credentials(request: Request, conversation_id: str) -> JSONResponse:
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
    response = await forward(web, "POST", _path(conversation_id, "credentials"), sent)
    # Whatever the service said, only these keys go back to the browser.
    body = json.loads(response.body)
    kept = {k: body[k] for k in ("stored", "refs", "ref", "message") if k in body}
    return chat_json(response.status_code, kept)


@router.post("/{conversation_id}/cancel")
async def cancel(request: Request, conversation_id: str) -> JSONResponse:
    """Stop: ends the assistant's turn and the conversation's runs (T050)."""
    if not same_origin(request):
        return chat_refused()
    return await forward(web_of(request), "POST", _path(conversation_id, "cancel"), {})


@router.post("/{conversation_id}/reset")
async def reset(request: Request, conversation_id: str) -> JSONResponse:
    """Reset: a fresh assistant session on the next message (T051)."""
    if not same_origin(request):
        return chat_refused()
    return await forward(web_of(request), "POST", _path(conversation_id, "reset"), {})
