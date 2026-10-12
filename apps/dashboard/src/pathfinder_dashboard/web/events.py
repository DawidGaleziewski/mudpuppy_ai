"""The live event stream (SSE) the pages' live regions listen to."""

from __future__ import annotations

from collections.abc import AsyncIterable
from typing import Annotated

from fastapi import APIRouter, Header, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent

from .. import live
from .deps import web_of

router = APIRouter()


@router.get("/events", response_class=EventSourceResponse)
async def events(
    request: Request,
    env: str | None = None,
    last_event_id: Annotated[str | None, Header()] = None,
) -> AsyncIterable[ServerSentEvent]:
    web = web_of(request)
    settings = web.settings
    c = web.ctx(request, env)
    async for event in live.watch(
        c.data_dir,
        c.env,
        dev=settings.dev,
        last_event_id=last_event_id,
        interval=settings.poll_interval_s,
        keepalive=settings.keepalive_s,
        max_seconds=settings.sse_max_s,
    ):
        if await request.is_disconnected():
            break
        yield event
