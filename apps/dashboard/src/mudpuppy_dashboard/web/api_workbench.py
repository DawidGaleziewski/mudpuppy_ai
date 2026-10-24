"""The React console's Workbench (R-100, spec 071; spec 043, designer 14-workbench.md): the page
model as JSON, Send, the Path switch, command cards (open, Confirm with the card's one-time token,
Cancel) and "Right view?". Behind `MUDPUPPY_WORKBENCH`. The words arrive over the chat relay
(`/chat/conversations/{id}/events`); the page reads the store again when a view or a command
lands, and while a scan runs. Every write goes through the chat service (D-2). No SQL here."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from .. import chat_client, queries_wb, status_map
from ..wb_frames import PATH_WORDS, REASONS
from .chat_forward import read_json
from .chat_writes import write_answer
from .deps import Ctx, Web, same_origin, web_of
from .workbench_model import blocked_reason, chat, cmd_path, page_model, tokens_for

router = APIRouter(prefix="/api/workbench")


def _paused(web: Web, c: Ctx) -> str | None:
    """Why commands are off here, or None (spec 048 D-6: per environment)."""
    if not web.settings.workbench_commands:
        return "Commands are paused. Use Scans for now."
    allowed = {e.strip() for e in web.settings.workbench_command_envs.split(",") if e.strip()}
    if c.env not in allowed:
        return f"Workbench commands are off on {c.env}. Start scans in Scans."
    if not web.settings.reviewer:
        return "Set MUDPUPPY_REVIEWER to your name to confirm commands."
    return None


def _statuses(vocabulary: str) -> dict[str, dict[str, Any]]:
    return {
        k: {"shape": s.shape, "word": s.word}
        for k, s in status_map.VOCABULARIES[vocabulary].items()
    }


@router.get("/portals/{portal}")
async def page(
    request: Request, portal: str, c: str | None = None, sel: str | None = None, new: int = 0
) -> JSONResponse:
    """The conversation asked for (`c`), else the portal's newest; `sel` the selected page."""
    web = web_of(request)
    ctx = web.ctx(request, None)
    if not web.settings.workbench:
        raise HTTPException(404, "The Workbench is paused.")
    with ctx.conn() as conn:
        conv = queries_wb.conversation(conn, c) if c else None
        if conv is None and not new:
            last = queries_wb.recent(conn, portal)
            conv = last[0][0] if last else None
        commands = queries_wb.commands(conn, conv.id) if conv else []
    tokens = await tokens_for(web, commands)
    ctx.portal = portal
    with ctx.conn() as conn:
        model = page_model(ctx, conn, conv, sel, tokens)
    model.blocked = await blocked_reason(web)
    body = jsonable_encoder(model)
    body["paused"] = _paused(web, ctx)
    body["path_words"] = PATH_WORDS
    body["reasons"] = REASONS
    body["statuses"] = {"wb_scan": _statuses("wb_scan"), "wb_cmd": _statuses("wb_cmd")}
    return JSONResponse(body, headers={"Cache-Control": "no-store"})


def _message(reply: object, status: int) -> str:
    message = reply.get("message") if isinstance(reply, dict) else None
    return str(message or status).rstrip(".")


@router.post("/portals/{portal}/turns")
async def send(request: Request, portal: str) -> JSONResponse:
    """Send (WB-UI-30): `text`, `ctx` chips, `c` (none: the first message creates it)."""
    if not same_origin(request):
        return write_answer(403, "Cross-origin request refused.")
    web = web_of(request)
    form = await read_json(request)
    text = str(form.get("text") or "").strip()
    conversation = str(form.get("c") or "")
    # spec 075: the live Workbench's first message starts a live conversation
    live = form.get("live") is True
    if not text:
        return write_answer(422, "Write a message first.")
    try:
        if not conversation:
            new = {"portal": portal, **({"live": True} if live else {})}
            status, reply = await chat(web, "POST", "/workbench/conversations", new)
            if status != 201 or not isinstance(reply, dict):
                return write_answer(502, f"Not sent: {_message(reply, status)}.")
            conversation = str(reply["conversation_id"])
        ctx = form.get("ctx") if isinstance(form.get("ctx"), list) else []
        path = f"/workbench/conversations/{quote(conversation, safe='')}/turns"
        body = {"text": text, "ctx": ctx, "by": web.settings.reviewer}
        status, reply = await chat(web, "POST", path, body)
    except chat_client.ChatUnavailable:
        return write_answer(503, chat_client.not_running(web.ctx(request, None).env))
    if status != 202 or not isinstance(reply, dict):
        return write_answer(502, f"Not sent: {_message(reply, status)}.")
    page = "workbench/live" if live else "workbench"
    href = f"/app/portals/{quote(portal, safe='')}/{page}?c={quote(conversation, safe='')}"
    return write_answer(200, f"Sent as turn {reply.get('turn')}.", href)


@router.post("/conversations/{conversation}/path")
async def path(request: Request, conversation: str) -> JSONResponse:
    """The Path switch (WB-UI-03): the person's choice wins until they ask for something else."""
    if not same_origin(request):
        return write_answer(403, "Cross-origin request refused.")
    web = web_of(request)
    chosen = str((await read_json(request)).get("path") or "")
    url = f"/workbench/conversations/{quote(conversation, safe='')}/path"
    try:
        status, reply = await chat(web, "POST", url, {"path": chosen})
    except chat_client.ChatUnavailable:
        return write_answer(503, chat_client.not_running(web.ctx(request, None).env))
    if status >= 300:
        return write_answer(502, f"Not switched: {_message(reply, status)}.")
    return write_answer(200, f"Path: {PATH_WORDS.get(chosen, chosen)}.")


@router.post("/commands")
async def open_card(request: Request) -> JSONResponse:
    """A command card from a view's button (Resume on an ErrorCard): it asks first (WB-UI-20)."""
    if not same_origin(request):
        return write_answer(403, "Cross-origin request refused.")
    web = web_of(request)
    c = web.ctx(request, None)
    if paused := _paused(web, c):
        return write_answer(409, paused)
    form = await read_json(request)
    command = str(form.get("command") or "")
    # persona.add opens with drafted args the person edits (spec 072); the others name a scan
    if command == "persona.add" and isinstance(form.get("args"), dict):
        args: dict[str, Any] = form["args"]
    else:
        args = {"scan": form["scan"]} if form.get("scan") else {}
    body = {
        "conversation_id": str(form.get("c") or ""),
        "turn": form.get("turn") if isinstance(form.get("turn"), int) else None,
        "command": command,
        "args": args,
    }
    try:
        status, reply = await chat(web, "POST", "/workbench/commands", body)
    except chat_client.ChatUnavailable:
        return write_answer(503, chat_client.not_running(c.env))
    if status != 201:
        return write_answer(502, f"Can't do that now: {_message(reply, status)}.")
    return write_answer(200, "The card asks first: nothing runs until you confirm.")


@router.post("/commands/{command_id}/{action}")
async def card_action(request: Request, command_id: str, action: str) -> JSONResponse:
    """Confirm (with the card's one-time token, a Start card's persona, an editable card's
    args), Cancel, or Undo a done persona.add (spec 072)."""
    if not same_origin(request):
        return write_answer(403, "Cross-origin request refused.")
    if action not in DONE_WORDS:
        return write_answer(404, "Confirm, cancel or undo.")
    web = web_of(request)
    c = web.ctx(request, None)
    if action == "confirm" and (paused := _paused(web, c)):
        return write_answer(409, paused)
    form = await read_json(request)
    body: dict[str, Any] = {"token": str(form.get("token") or ""), "by": web.settings.reviewer}
    if form.get("persona"):
        body["persona"] = str(form["persona"])
    if isinstance(form.get("args"), dict):
        body["args"] = form["args"]
    try:
        status, reply = await chat(web, "POST", cmd_path(command_id, action), body)
    except chat_client.ChatUnavailable:
        return write_answer(503, chat_client.not_running(c.env))
    if status >= 300:
        return write_answer(502, f"Not done: {_message(reply, status)}.")
    return write_answer(200, DONE_WORDS[action])


DONE_WORDS = {
    "confirm": "Confirmed.",
    "cancel": "Cancelled · nothing changed.",
    "undo": "Undone.",
}


@router.post("/views/{view_id}/feedback")
async def feedback(request: Request, view_id: str) -> JSONResponse:
    """Right view? Yes / No; after No, each reason toggles and the text is kept (WB-UI-28)."""
    if not same_origin(request):
        return write_answer(403, "Cross-origin request refused.")
    web = web_of(request)
    c = web.ctx(request, None)
    form = await read_json(request)
    by = web.settings.reviewer or "unknown"
    with c.conn() as conn:
        _, reasons = queries_wb.feedback(conn, view_id, by)
    picked = set(reasons)
    if toggle := form.get("toggle"):
        picked ^= {str(toggle)}
    body = {
        "by": by,
        "value": str(form.get("value") or ""),
        "reasons": sorted(picked),
        "text": form.get("text"),
    }
    try:
        status, reply = await chat(web, "POST", f"/workbench/views/{view_id}/feedback", body)
    except chat_client.ChatUnavailable:
        return write_answer(503, chat_client.not_running(c.env))
    if status != 200:
        return write_answer(422, f"Not saved: {_message(reply, status)}.")
    return write_answer(200, "Thanks: kept with this view.")
