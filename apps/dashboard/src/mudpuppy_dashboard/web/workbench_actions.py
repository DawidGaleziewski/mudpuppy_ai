"""Workbench card and feedback actions (spec 043 T033, T037; WB-UI-20…24, -28): a command card
opened from a view's button, Confirm with the card's one-time token, Cancel, and "Right view?".
Each forwards to the chat service, signed with the reviewer's name, and answers the part in its
new state, read back from the store."""

from __future__ import annotations

from html import escape
from urllib.parse import parse_qs

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, Response

from .. import chat_client, queries_wb, wb_render
from ..wb_frames import Feedback
from .deps import Ctx, Web, same_origin, web_of
from .views_workbench import chat, cmd_path, render_ctx, tokens_for

router = APIRouter()


async def _form(request: Request) -> dict[str, str]:
    body = (await request.body()).decode("utf-8", "replace")
    return {k: v[0] for k, v in parse_qs(body).items()}


def _note(text: str, status: int = 200) -> HTMLResponse:
    return HTMLResponse(f'<p class="sy-small sy-muted" role="status">{escape(text)}</p>', status)


def _paused(web: Web, c: Ctx) -> str | None:
    if not web.settings.workbench_commands:
        return "Commands are paused. Use Scans for now."
    if c.as_of is not None:
        return "The Workbench works on now. Back to now to run commands."
    if not web.settings.reviewer:
        return "Set MUDPUPPY_REVIEWER to your name to confirm commands."
    return None


async def _card(web: Web, c: Ctx, command_id: str) -> Response:
    """The card as the store has it now (with a fresh token while proposed)."""
    with c.conn() as conn:
        cmd = queries_wb.command(conn, command_id)
        conv = queries_wb.conversation(
            conn, queries_wb.conversation_of_command(conn, command_id) or ""
        )
    if cmd is None or conv is None:
        return _note("This command does not exist any more.", 404)
    tokens = await tokens_for(web, [cmd])
    with c.conn() as conn:
        card = wb_render.command_card(render_ctx(c, conn, conv, tokens), cmd)
    return web.render(c, "workbench/f_command.html", card=card)


@router.post("/workbench/commands", response_model=None)
async def open_card(request: Request, env: str | None = None) -> Response:
    """A command card from a view's button (Resume on an ErrorCard); it asks first (WB-UI-20)."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    form = await _form(request)
    if paused := _paused(web, c):
        return _note(paused)
    body = {
        "conversation_id": form.get("c", ""),
        "turn": int(form["turn"]) if form.get("turn", "").isdigit() else None,
        "command": form.get("command", ""),
        "args": {"scan": form["scan"]} if form.get("scan") else {},
    }
    try:
        status, reply = await chat(web, "POST", "/workbench/commands", body)
    except chat_client.ChatUnavailable:
        return _note(chat_client.not_running(c.env))
    if status != 201 or not isinstance(reply, dict):
        message = reply.get("message") if isinstance(reply, dict) else status
        return _note(f"Can't do that now: {str(message).rstrip('.')}.")
    return await _card(web, c, str(reply["id"]))


@router.post("/workbench/commands/{command_id}/{action}", response_model=None)
async def card_action(
    request: Request, command_id: str, action: str, env: str | None = None
) -> Response:
    """Confirm (with the card's token) or Cancel; answers the card in its new state."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    if action not in ("confirm", "cancel"):
        return PlainTextResponse("Not found.", status_code=404)
    web = web_of(request)
    c = web.ctx(request, env)
    form = await _form(request)
    if action == "confirm" and (paused := _paused(web, c)):
        return _note(paused)
    body = {"token": form.get("token", ""), "by": web.settings.reviewer}
    try:
        await chat(web, "POST", cmd_path(command_id, action), body)
    except chat_client.ChatUnavailable:
        return _note(chat_client.not_running(c.env))
    return await _card(web, c, command_id)


@router.post("/workbench/views/{view_id}/feedback", response_model=None)
async def view_feedback(request: Request, view_id: str, env: str | None = None) -> Response:
    """Right view? Yes / No; after No, each reason toggles and the text is kept (WB-UI-28)."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    form = await _form(request)
    by = web.settings.reviewer or "unknown"
    with c.conn() as conn:
        _, reasons = queries_wb.feedback(conn, view_id, by)
    picked = set(reasons)
    toggle = form.get("toggle")
    if toggle:
        picked ^= {toggle}
    value = form.get("value", "")
    body = {"by": by, "value": value, "reasons": sorted(picked), "text": form.get("text")}
    try:
        status, _reply = await chat(web, "POST", f"/workbench/views/{view_id}/feedback", body)
    except chat_client.ChatUnavailable:
        return _note(chat_client.not_running(c.env))
    with c.conn() as conn:
        stored, stored_reasons = queries_wb.feedback(conn, view_id, by)
    fb = Feedback(c.url(f"/workbench/views/{view_id}/feedback"), stored, stored_reasons)
    return web.render(
        c, "workbench/f_feedback.html", fb=fb, status_code=200 if status == 200 else 422
    )
