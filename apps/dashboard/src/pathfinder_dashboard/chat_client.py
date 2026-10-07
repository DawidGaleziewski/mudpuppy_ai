"""Server-side client for the local chat service (`apps/chat`, spec 010).

Contract: specs/010-acp-chat-orchestrator/contracts/chat-http-api.md.

The browser never talks to the service: it calls the dashboard's `/chat/...` routes, which call
the service from here. The service is a separate local process and may simply not be running,
so every failure becomes a `ChatUnavailable` with a plain-language message, never a traceback.
"""

from __future__ import annotations

import httpx2

from .settings import Settings

START_HINT = "pnpm --dir apps/chat start"
NOT_RUNNING = (
    "The chat service is not running. Start it in a terminal with "
    f"`{START_HINT}`, then reload this page."
)


class ChatUnavailable(Exception):
    """The chat service could not be reached (not running, refused, timed out)."""


def make_client(
    settings: Settings, transport: httpx2.AsyncBaseTransport | None = None, stream: bool = False
) -> httpx2.AsyncClient:
    # A stream stays open for the whole conversation, so it has no read timeout.
    if stream:
        timeout = httpx2.Timeout(settings.chat_timeout_s, read=None)
    else:
        timeout = httpx2.Timeout(settings.chat_timeout_s)
    return httpx2.AsyncClient(
        base_url=settings.chat_url.rstrip("/"), timeout=timeout, transport=transport
    )


async def service_up(
    settings: Settings, transport: httpx2.AsyncBaseTransport | None = None
) -> bool:
    """One quick look at `/healthz`; any answer at all means the process is alive."""
    try:
        async with make_client(settings, transport) as client:
            r = await client.get("/healthz")
        return r.status_code < 500
    except httpx2.HTTPError:
        return False


async def call(
    settings: Settings,
    method: str,
    path: str,
    json: object | None = None,
    transport: httpx2.AsyncBaseTransport | None = None,
) -> tuple[int, object]:
    """One request; returns (status, parsed JSON body or `{}` when there is none)."""
    try:
        async with make_client(settings, transport) as client:
            r = await client.request(method, path, json=json)
    except httpx2.HTTPError as err:
        raise ChatUnavailable(NOT_RUNNING) from err
    try:
        body = r.json()
    except ValueError:
        body = {}
    return r.status_code, body
