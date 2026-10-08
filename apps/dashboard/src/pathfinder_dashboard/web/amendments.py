"""TO-BE amendments: the forms' posts, forwarded to the chat service (T031, T033), and the
superseded-amendments page (FR-022)."""

from __future__ import annotations

import sqlite3
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse

from .. import db, queries_chat
from .chat_forward import chat_json, chat_refused, forward, invalid, read_json
from .deps import Ctx, same_origin, web_of

router = APIRouter()

# Largest attachment the chat service takes is 8 MB of file content; base64 adds a third.
MAX_ATTACHMENT_B64 = (8 * 1024 * 1024 * 4 + 2) // 3


@router.post("/chat/portals/{portal}/amendments")
async def amendment_create(request: Request, portal: str) -> JSONResponse:
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    fields = await read_json(request)
    sent: dict[str, Any] = {
        k: fields[k]
        for k in ("kind", "target_kind", "target_id", "text", "author")
        if isinstance(fields.get(k), str) and fields[k].strip()
    }
    attachment = fields.get("attachment")
    if isinstance(attachment, dict):
        name, content = attachment.get("name"), attachment.get("content_base64")
        if not isinstance(name, str) or not isinstance(content, str) or not content:
            return invalid("The attachment could not be read.")
        if len(content) > MAX_ATTACHMENT_B64:
            return chat_json(413, {"ref": None, "message": "The attachment is larger than 8 MB."})
        sent["attachment"] = {"name": name, "content_base64": content}
    if not all(k in sent for k in ("kind", "target_kind", "target_id")):
        return invalid("The amendment has no target.")
    return await forward(web, "POST", f"/portals/{quote(portal, safe='')}/amendments", sent)


@router.delete("/chat/portals/{portal}/amendments/{amendment_id}")
async def amendment_withdraw(request: Request, portal: str, amendment_id: str) -> JSONResponse:
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    return await forward(
        web,
        "DELETE",
        f"/portals/{quote(portal, safe='')}/amendments/{quote(amendment_id, safe='')}",
    )


@router.post("/chat/portals/{portal}/amendments/{amendment_id}/reapply")
async def amendment_reapply(request: Request, portal: str, amendment_id: str) -> JSONResponse:
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    fields = await read_json(request)
    sent = {
        k: fields[k]
        for k in ("target_kind", "target_id", "text")
        if isinstance(fields.get(k), str) and fields[k].strip()
    }
    if "target_kind" not in sent or "target_id" not in sent:
        return invalid("Choose the state to apply it to.")
    return await forward(
        web,
        "POST",
        f"/portals/{quote(portal, safe='')}/amendments/{quote(amendment_id, safe='')}/reapply",
        sent,
    )


@router.post("/chat/portals/{portal}/amendments/{amendment_id}/dismiss")
async def amendment_dismiss(request: Request, portal: str, amendment_id: str) -> JSONResponse:
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    return await forward(
        web,
        "POST",
        f"/portals/{quote(portal, safe='')}/amendments/{quote(amendment_id, safe='')}/dismiss",
        {},
    )


def superseded_values(
    c: Ctx, conn: sqlite3.Connection, portal: str | None, show: str | None
) -> dict[str, Any]:
    portal = portal or None
    show = show if show in queries_chat.SHOW_FILTERS else "superseded"
    items = queries_chat.superseded_amendments(conn, portal, show)
    states = {p: queries_chat.portal_states(conn, p) for p in sorted({a.portal_id for a in items})}
    return {
        "items": items,
        "portal": portal,
        "show": show,
        "portals": queries_chat.amendment_portals(conn),
        "states": states,
        "reasons": queries_chat.SUPERSEDED_REASONS,
        "form_action": c.url("/amendments/superseded"),
        "fragment_url": c.url("/fragments/amendments/superseded"),
        "self_url": c.url("/fragments/amendments/superseded", portal=portal, show=show),
    }


@router.get("/amendments/superseded", response_class=HTMLResponse)
def superseded_page(
    request: Request, env: str | None = None, portal: str | None = None, show: str | None = None
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            return web.render(
                c,
                "amendments.html",
                nav_current="amendments",
                v=superseded_values(c, conn, portal, show),
            )
    except db.StoreMissing as err:
        return web.missing(c, err)


@router.get("/fragments/amendments/superseded", response_class=HTMLResponse)
def fragment_superseded(
    request: Request,
    env: str | None = None,
    portal: str | None = None,
    show: str | None = None,
    push: bool = False,
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            v = superseded_values(c, conn, portal, show)
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)
    return web.render(
        c,
        "partials/amendments_superseded.html",
        v=v,
        push=c.url("/amendments/superseded", portal=v["portal"], show=v["show"]) if push else None,
    )
