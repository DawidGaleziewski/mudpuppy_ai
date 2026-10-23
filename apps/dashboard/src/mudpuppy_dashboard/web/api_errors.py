"""The React console's error reference (R-100, spec 071): the assistant's error-log line behind an
`ERR-…` reference, read through the chat service (not the store). No SQL here (G-15)."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Request
from pydantic import BaseModel

from .. import chat_client
from .deps import web_of

router = APIRouter(prefix="/api")

ERR_REF = re.compile(r"^ERR-[A-Za-z0-9-]{1,64}$")


class ErrorEntry(BaseModel):
    ref: str
    #: The log line, None when there is none for this reference.
    entry: dict[str, Any] | None
    #: The chat service did not answer; `start` is its start command.
    unavailable: bool
    start: str


@router.get("/errors/{ref}")
async def error_entry(request: Request, ref: str, env: str | None = None) -> ErrorEntry:
    web = web_of(request)
    c = web.ctx(request, env)
    entry: dict[str, Any] | None = None
    unavailable = False
    if ERR_REF.match(ref):
        try:
            code, body = await chat_client.call(
                web.settings, "GET", f"/errors/{quote(ref, safe='')}", None, web.chat_transport
            )
        except chat_client.ChatUnavailable:
            unavailable = True
        else:
            entry = body if code == 200 and isinstance(body, dict) else None
    return ErrorEntry(
        ref=ref, entry=entry, unavailable=unavailable, start=chat_client.start_hint(c.env)
    )
