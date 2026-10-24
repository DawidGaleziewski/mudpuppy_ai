"""The live Workbench's WebSocket (spec 075, the R-96 spike; owner 2026-10-22: "i want web
sockets"): `/api/workbench/live/{conversation}/ws` sends AG-UI events, and the person's actions
come back on it.

Down: `STATE_SNAPSHOT` on connect and `STATE_DELTA` (JSON Patch) when the projection changes (read
again about once a second, and at once after a chat event); `MESSAGES_SNAPSHOT` when the stored
conversation changes; the assistant's words as `TEXT_MESSAGE_START` / `_CONTENT` / `_END` and its
turns as `RUN_STARTED` / `RUN_FINISHED`, relayed from the chat service's event stream; the A2UI
surfaces as `CUSTOM` `a2ui`; `CUSTOM` `notice` for an action's outcome, `CUSTOM` `heartbeat` every
15 s. Every frame has a `seq`; a reconnect gets a fresh snapshot (D-2), and the words resume from
`?chat_after=` (the chat's event id, carried as `chatId`).

Up: `{"type": "action", "action": <A2UI action>}` and `{"type": "say", "text": …}`. Selection is
shared state (`/ui/selected`); every write goes through the chat service, a command only with its
one-time token, fetched here at Confirm. Same origin only. No SQL here."""

from __future__ import annotations

import asyncio
import contextlib
import json
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote, urlsplit

import httpx2
import jsonpatch
from ag_ui.core import (
    CustomEvent,
    EventType,
    MessagesSnapshotEvent,
    RunFinishedEvent,
    RunStartedEvent,
    StateDeltaEvent,
    StateSnapshotEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
)
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from .. import chat_client, queries_wb, wb_a2ui
from .deps import Ctx, Web, web_of
from .workbench_live import project
from .workbench_model import blocked_reason, chat, cmd_path

router = APIRouter(prefix="/api/workbench/live")

HEARTBEAT_S = 15.0
POLL_S = 1.0
# Chat events after which the store has something new to show at once.
WAKE = {
    "wb_view",
    "wb_command",
    "wb_no_view",
    "message_done",
    "idle",
    "step_changed",
    "notice",
    "error",
}


def dump(event: Any) -> dict[str, Any]:
    out: dict[str, Any] = event.model_dump(mode="json", by_alias=True, exclude_none=True)
    return out


def custom(name: str, value: Any) -> dict[str, Any]:
    return dump(CustomEvent(type=EventType.CUSTOM, name=name, value=value))


def same_origin(socket: WebSocket) -> bool:
    origin = socket.headers.get("origin")
    return origin is not None and urlsplit(origin).netloc == socket.headers.get("host", "")


def paused(web: Web, c: Ctx) -> str | None:
    """Why commands are off here (spec 048 D-6), as the Workbench page says it."""
    if not web.settings.workbench_commands:
        return "Commands are paused. Use Scans for now."
    allowed = {e.strip() for e in web.settings.workbench_command_envs.split(",") if e.strip()}
    if c.env not in allowed:
        return f"Workbench commands are off on {c.env}: the chat service runs one environment."
    return None


class Live:
    """One socket: what it last sent, and the person's selection."""

    def __init__(self, socket: WebSocket, web: Web, c: Ctx, conversation: str) -> None:
        self.socket = socket
        self.web = web
        self.c = c
        self.conversation = conversation
        self.seq = 0
        self.state: dict[str, Any] | None = None
        self.surfaces: dict[str, list[dict[str, Any]]] = {}
        self.messages: list[dict[str, Any]] | None = None
        self.selected: dict[str, Any] | None = None
        self.wake = asyncio.Event()
        self.lock = asyncio.Lock()

    async def send(self, event: dict[str, Any]) -> None:
        async with self.lock:
            self.seq += 1
            await self.socket.send_json({**event, "seq": self.seq})

    # -- down: the projection -------------------------------------------------------------

    async def refresh(self) -> None:
        with self.c.conn(now=True) as conn:
            conv = queries_wb.conversation(conn, self.conversation)
            if conv is None:
                return
            p = project(self.c, conn, conv, self.selected, paused(self.web, self.c))
        if self.state is None:
            await self.send(
                dump(StateSnapshotEvent(type=EventType.STATE_SNAPSHOT, snapshot=p.state))
            )
        elif ops := jsonpatch.make_patch(self.state, p.state).patch:
            await self.send(dump(StateDeltaEvent(type=EventType.STATE_DELTA, delta=ops)))
        self.state = p.state
        await self.send_surfaces(p.surfaces)
        if p.messages != self.messages:
            await self.send(
                dump(MessagesSnapshotEvent(type=EventType.MESSAGES_SNAPSHOT, messages=p.messages))
            )
            self.messages = p.messages

    async def send_surfaces(self, surfaces: dict[str, list[dict[str, Any]]]) -> None:
        out: list[dict[str, Any]] = []
        for sid, comps in surfaces.items():
            if sid not in self.surfaces:
                out += wb_a2ui.surface_messages(sid, comps)
            elif comps != self.surfaces[sid]:
                out.append(wb_a2ui.update_messages(sid, comps))
        out += [wb_a2ui.delete_message(sid) for sid in self.surfaces if sid not in surfaces]
        self.surfaces = surfaces
        if out:
            await self.send(custom("a2ui", out))

    async def poll(self) -> None:
        while True:
            await self.refresh()
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self.wake.wait(), POLL_S)
            self.wake.clear()

    async def heartbeat(self) -> None:
        while True:
            await asyncio.sleep(HEARTBEAT_S)
            await self.send(custom("heartbeat", {"at": datetime.now(UTC).isoformat()}))

    # -- down: the assistant's words, from the chat service's stream ----------------------

    async def relay(self, after: str | None) -> None:
        """The chat's SSE stream as AG-UI text and run events; reconnects while the socket lives."""
        last = after
        while True:
            try:
                last = await self._stream(last)
            except (httpx2.HTTPError, chat_client.ChatUnavailable):
                await self.send(custom("chat", {"up": False}))
            await asyncio.sleep(3)

    async def _stream(self, last: str | None) -> str | None:
        client = chat_client.make_client(self.web.settings, self.web.chat_transport, stream=True)
        headers = {"accept": "text/event-stream", **({"last-event-id": last} if last else {})}
        path = f"/conversations/{quote(self.conversation, safe='')}/events"
        talk = Talk(self)
        async with client, client.stream("GET", path, headers=headers) as upstream:
            if upstream.status_code != 200:
                raise chat_client.ChatUnavailable(str(upstream.status_code))
            await self.send(custom("chat", {"up": True}))
            frame: dict[str, str] = {}
            async for line in upstream.aiter_lines():
                if line:
                    key, _, value = line.partition(":")
                    frame[key] = value.strip()
                    continue
                last = frame.get("id", last)
                await talk.on(frame.get("event", ""), frame.get("data", "{}"), last)
                frame = {}
        return last

    # -- up: the person's actions ---------------------------------------------------------

    async def receive(self) -> None:
        while True:
            message = await self.socket.receive_json()
            if not isinstance(message, dict):
                continue
            try:
                if message.get("type") == "say":
                    await self.say(str(message.get("text") or ""))
                elif message.get("type") == "action" and isinstance(message.get("action"), dict):
                    await self.act(message["action"])
            except chat_client.ChatUnavailable:
                await self.notice("failure", chat_client.not_running(self.c.env))
            self.wake.set()

    async def notice(self, tone: str, text: str) -> None:
        await self.send(custom("notice", {"tone": tone, "text": text}))

    async def say(self, text: str) -> None:
        if not text.strip():
            return
        sel = self.selected
        ctx = (
            [{"kind": "page", "scan": sel["scan"], "route": sel["route"]}]
            if sel and sel.get("scan")
            else []
        )
        path = f"/workbench/conversations/{quote(self.conversation, safe='')}/turns"
        status, reply = await chat(
            self.web, "POST", path, {"text": text, "ctx": ctx, "by": self.web.settings.reviewer}
        )
        if status != 202:
            await self.notice("failure", f"Not sent: {_message(reply, status)}.")

    async def act(self, action: dict[str, Any]) -> None:
        name = str(action.get("name") or "")
        context = action.get("context") if isinstance(action.get("context"), dict) else {}
        if name in ("page.select", "map.select"):
            self.selected = {
                k: context[k] for k in ("scan", "route", "state") if k in context
            } or None
        elif name.startswith("command."):
            await self.command(name.removeprefix("command."), context)
        elif name == "suggestion.send":
            await self.say(str(context.get("text") or ""))
        elif name in ("choice.answer", "persona.new", "scan.stop", "scan.resume"):
            await self.forward(name, context)
        else:
            await self.notice("failure", f"The action {name} is not known.")

    async def command(self, verb: str, context: dict[str, Any]) -> None:
        """Confirm (the card's one-time token fetched now), Cancel or Undo, by the card's id."""
        card = (self.state or {}).get("commands", {}).get(str(context.get("command")))
        if card is None or verb not in ("confirm", "cancel", "undo"):
            await self.notice("failure", "This card is out of date.")
            return
        if verb == "confirm" and (why := paused(self.web, self.c)):
            await self.notice("failure", why)
            return
        command_id = card["commandId"]
        body: dict[str, Any] = {"by": self.web.settings.reviewer}
        if verb == "confirm":
            status, reply = await chat(self.web, "POST", cmd_path(command_id, "token"), {})
            if status != 200 or not isinstance(reply, dict):
                await self.notice("failure", f"Not done: {_message(reply, status)}.")
                return
            body["token"] = reply["token"]
            body |= {k: context[k] for k in ("persona", "args") if context.get(k)}
        status, reply = await chat(self.web, "POST", cmd_path(command_id, verb), body)
        if status >= 300:
            await self.notice("failure", f"Not done: {_message(reply, status)}.")

    async def forward(self, name: str, context: dict[str, Any]) -> None:
        """An answer to a choice, or a card the person asked for: the chat service decides."""
        if name == "choice.answer":
            choice = (self.state or {}).get("choices", {}).get(str(context.get("choice")))
            if choice is None:
                await self.notice("failure", "This choice is out of date.")
                return
            context = {**context, "choice": choice["choiceId"]}
        path = f"/workbench/conversations/{quote(self.conversation, safe='')}/actions"
        status, reply = await chat(self.web, "POST", path, {"name": name, "context": context})
        if status >= 300:
            await self.notice("failure", f"Not done: {_message(reply, status)}.")


class Talk:
    """The chat's events as AG-UI text and run events, for one stream."""

    def __init__(self, live: Live) -> None:
        self.live = live
        self.run: str | None = None
        self.message: str | None = None

    async def on(self, kind: str, data: str, chat_id: str | None) -> None:
        live = self.live
        thread = live.conversation
        if kind in ("message_chunk", "tool_started") and self.run is None:
            self.run = f"run-{chat_id}"
            await live.send(
                dump(RunStartedEvent(type=EventType.RUN_STARTED, thread_id=thread, run_id=self.run))
            )
        if kind == "message_chunk":
            text = _field(data, "text")
            if self.message is None:
                self.message = f"msg-{chat_id}"
                start = TextMessageStartEvent(
                    type=EventType.TEXT_MESSAGE_START, message_id=self.message, role="assistant"
                )
                await live.send(dump(start))
            if text:
                content = TextMessageContentEvent(
                    type=EventType.TEXT_MESSAGE_CONTENT, message_id=self.message, delta=text
                )
                await live.send({**dump(content), "chatId": chat_id})
        elif kind in ("message_done", "idle") and self.message is not None:
            await live.send(
                dump(TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=self.message))
            )
            self.message = None
        if kind == "idle" and self.run is not None:
            await live.send(
                {
                    **dump(
                        RunFinishedEvent(
                            type=EventType.RUN_FINISHED, thread_id=thread, run_id=self.run
                        )
                    ),
                    "chatId": chat_id,
                }
            )
            self.run = None
        if kind == "error":
            await live.notice("failure", f"{_field(data, 'message')} ({_field(data, 'ref')})")
        if kind in WAKE:
            live.wake.set()


def _field(data: str, key: str) -> str:
    try:
        value = json.loads(data).get(key)
    except (ValueError, AttributeError):
        return ""
    return value if isinstance(value, str) else ""


def _message(reply: object, status: int) -> str:
    message = reply.get("message") if isinstance(reply, dict) else None
    return str(message or status).rstrip(".")


@router.get("/portals/{portal}")
async def page(request: Request, portal: str) -> JSONResponse:
    """The live page's frame: the portal's live conversations, why commands or the assistant
    are off. The conversation itself comes over the socket."""
    web = web_of(request)
    c = web.ctx(request, None)
    with c.conn(now=True) as conn:
        recent = queries_wb.recent(conn, portal, live=True)
    body = {
        "portal": portal,
        "recent": [
            {"id": conv.id, "title": conv.title, "first": first, "created_at": conv.created_at}
            for conv, first in recent
        ],
        "paused": paused(web, c),
        "blocked": await blocked_reason(web),
        "starters": ["Start a map scan", "Add a persona", "Which portal should I look at?"],
    }
    return JSONResponse(body, headers={"Cache-Control": "no-store"})


@router.websocket("/{conversation}/ws")
async def live(socket: WebSocket, conversation: str) -> None:
    if not same_origin(socket):
        await socket.close(code=1008)
        return
    web: Web = socket.app.state.web
    c = web.ctx(socket, None)  # type: ignore[arg-type]  # a WebSocket has the query a Ctx reads
    with c.conn(now=True) as conn:
        conv = queries_wb.conversation(conn, conversation)
    if conv is None or not conv.live:
        await socket.close(code=1008)
        return
    await socket.accept()
    session = Live(socket, web, c, conversation)
    tasks = [
        asyncio.create_task(session.poll()),
        asyncio.create_task(session.heartbeat()),
        asyncio.create_task(session.relay(socket.query_params.get("chat_after"))),
    ]
    try:
        await session.receive()
    except WebSocketDisconnect:
        pass
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
