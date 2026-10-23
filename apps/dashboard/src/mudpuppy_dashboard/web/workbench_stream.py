"""The Workbench stream (spec 043 T014, FR-004; designer 17-genui-architecture.md § 5.4): one SSE
per tab, keyed by conversation. The words lane relays the chat service's events for the
conversation (ids pass through, so a reconnect resumes from `Last-Event-ID`) and renders each into
out-of-band fragments; the data lane watches the store and re-renders the turns whose scan
changed, with no model in between (WB-UI-13). A heartbeat every 15 s lets the page tell a
dropped stream (WB-UI-32)."""

from __future__ import annotations

import asyncio
import contextlib
import json
import time
from collections.abc import AsyncIterable
from dataclasses import dataclass, field
from typing import Annotated, Any
from urllib.parse import quote

import httpx2
from fastapi import APIRouter, Header, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent

from .. import chat_client, live, queries_wb
from ..queries_wb_scan import resolve_scan, scan_progress
from .deps import Ctx, Web, web_of
from .views_workbench import live_of, render_ctx, rendered_turns, tokens_for

router = APIRouter()

COALESCE_S = 0.25  # the answer is sent whole, at most every 250 ms (doc 17 § 5.3)
COMPOSING_BLOCKS = {"chat": (("cards", 160),), "mapping": (("live map", 220), ("narration", 120))}


@dataclass
class Tab:
    """What one connection has rendered and is waiting to flush."""

    web: Web
    c: Ctx
    conversation_id: str
    answer: str = ""
    answer_turn: int | None = None
    flushed_at: float = 0.0
    last_id: int | None = None  # the last words-lane event handled
    scans: dict[str, tuple[str, int]] = field(default_factory=dict)  # run id -> (status, steps)

    def fragment(self, what: str, **values: Any) -> str:
        template = self.web.templates.env.get_template("salvage/workbench/f_oob.html")
        page = {
            "conversation": queries_wb.WbConversation(self.conversation_id, "", "", "", None, "")
        }
        return template.render(c=self.c, page=page, what=what, **values)

    async def turn_fragments(self, numbers: set[int]) -> str:
        """The views, narration and cards of these turns, rendered from the store now."""
        with self.c.conn() as conn:
            conv = queries_wb.conversation(conn, self.conversation_id)
            if conv is None:
                return ""
            turns = queries_wb.turns(conn, conv.id)
            cmds = [cmd for t in turns if t.n in numbers for cmd in t.commands]
        tokens = await tokens_for(self.web, cmds)
        with self.c.conn() as conn:
            rendered = rendered_turns(render_ctx(self.c, conn, conv, tokens), turns)
        scan, card = live_of(rendered)
        parts = [
            self.fragment("turn", rt=rt, portal=conv.portal, sel=None, stale=False)
            for rt in rendered
            if rt.turn.n in numbers
        ]
        parts.append(self.fragment("livebar", live=scan, live_card=card))
        latest = next((t.view for t in reversed(turns) if t.view and not t.view.fallback), None)
        parts.append(self.fragment("pathswitch", conv=conv, why=latest.why if latest else None))
        return "".join(parts)


def _event(html: str, event_id: str | None = None) -> ServerSentEvent:
    """HTML as it is (`raw_data`: `data` would JSON-encode it)."""
    if event_id:
        return ServerSentEvent(raw_data=html, id=event_id)
    return ServerSentEvent(raw_data=html)


async def _words(tab: Tab, out: asyncio.Queue[ServerSentEvent], last_event_id: str | None) -> None:
    """Relay the chat's events for the conversation; reconnect after the service went away."""
    settings = tab.web.settings
    path = f"/conversations/{quote(tab.conversation_id, safe='')}/events"
    while True:
        headers = {"accept": "text/event-stream"}
        if last_event_id:
            headers["last-event-id"] = last_event_id
        client = chat_client.make_client(settings, tab.web.chat_transport, stream=True)
        # The chat service may be down: the data lane keeps going (WB-UI-33), this one retries.
        with contextlib.suppress(httpx2.HTTPError):
            async with client, client.stream("GET", path, headers=headers) as upstream:
                async for event_id, kind, data in _parse(upstream.aiter_lines()):
                    if _seen(tab, event_id):
                        continue  # a replay of what this tab already has
                    last_event_id = event_id or last_event_id
                    html = await _render_word(tab, kind, data)
                    if html:
                        await out.put(_event(html, event_id))
        await asyncio.sleep(2)


def _seen(tab: Tab, event_id: str | None) -> bool:
    """True for an event at or before the last one this tab handled (ids rise per conversation)."""
    if event_id is None or not event_id.isdigit():
        return False
    if tab.last_id is not None and int(event_id) <= tab.last_id:
        return True
    tab.last_id = int(event_id)
    return False


async def _parse(lines: AsyncIterable[str]) -> AsyncIterable[tuple[str | None, str, dict]]:
    event_id: str | None = None
    kind, data = "message", ""
    async for line in lines:
        if line == "":
            if data:
                try:
                    payload = json.loads(data)
                except ValueError:
                    payload = {}
                yield event_id, kind, payload if isinstance(payload, dict) else {}
            event_id, kind, data = None, "message", ""
        elif line.startswith("id:"):
            event_id = line[3:].strip()
        elif line.startswith("event:"):
            kind = line[6:].strip()
        elif line.startswith("data:"):
            data += line[5:].strip()


def _current_turn(tab: Tab) -> int:
    with tab.c.conn() as conn:
        return queries_wb.current_turn(conn, tab.conversation_id)


async def _render_word(tab: Tab, kind: str, data: dict) -> str:
    """One chat event as the fragments it changes (answer first: text never waits, WB-UI-30)."""
    if kind == "message_chunk":
        if tab.answer_turn is None:
            tab.answer_turn = _current_turn(tab)
        tab.answer += str(data.get("text", ""))
        if time.monotonic() - tab.flushed_at < COALESCE_S:
            return ""
        return _flush(tab)
    if kind in ("message_done", "idle"):
        text = _flush(tab) if tab.answer else ""
        if kind == "idle":
            tab.answer, tab.answer_turn = "", None
        return text
    if kind == "wb_composing":
        n = int(data.get("turn", 0))
        path = "mapping"  # the frame takes the size of the path's usual view
        blocks = COMPOSING_BLOCKS[path]
        return tab.fragment("composing", n=n, blocks=blocks)
    if kind == "wb_no_view":
        return tab.fragment("no_view", n=int(data.get("turn", 0)))
    if kind == "wb_view":
        return await tab.turn_fragments({int(data.get("turn", 0))})
    if kind == "wb_command":
        with tab.c.conn() as conn:
            cmd = queries_wb.command(conn, str(data.get("id", "")))
        return await tab.turn_fragments({cmd.turn}) if cmd else ""
    return ""


def _flush(tab: Tab) -> str:
    tab.flushed_at = time.monotonic()
    paras = [p.strip() for p in tab.answer.split("\n\n") if p.strip()]
    return tab.fragment("text", n=tab.answer_turn or _current_turn(tab), paras=paras)


async def _data(tab: Tab, out: asyncio.Queue[ServerSentEvent]) -> None:
    """The data lane: on a store commit, re-render the turns whose bound scan moved (< 1 s)."""
    settings = tab.web.settings
    watcher = live.StoreWatcher(tab.c.data_dir, tab.c.env)
    last_ping = time.monotonic()
    try:
        while True:
            await asyncio.sleep(settings.poll_interval_s)
            if watcher.changed():
                changed = _moved_turns(tab)
                if changed:
                    await out.put(_event(await tab.turn_fragments(changed)))
            if time.monotonic() - last_ping >= settings.keepalive_s:
                last_ping = time.monotonic()
                await out.put(ServerSentEvent(event="heartbeat", data="{}"))
    finally:
        watcher.close()


def _moved_turns(tab: Tab) -> set[int]:
    """Turns binding a scan whose status or step count changed since the last look."""
    moved: set[int] = set()
    with tab.c.conn() as conn:
        conv = queries_wb.conversation(conn, tab.conversation_id)
        if conv is None:
            return moved
        for n, view in queries_wb.views(conn, conv.id).items():
            for comp in view.spec.get("components", []):
                scan_id = comp.get("bind", {}).get("scan")
                run = resolve_scan(conn, conv.portal, scan_id) if isinstance(scan_id, str) else None
                if run is None:
                    continue
                now = scan_progress(conn, run)
                if tab.scans.get(run) != now:
                    tab.scans[run] = now
                    moved.add(n)
    return moved


@router.get("/workbench/stream", response_class=EventSourceResponse)
async def workbench_stream(
    request: Request,
    c: str,
    env: str | None = None,
    last_event_id: Annotated[str | None, Header()] = None,
) -> AsyncIterable[ServerSentEvent]:
    web = web_of(request)
    tab = Tab(web=web, c=web.ctx(request, env), conversation_id=c)
    out: asyncio.Queue[ServerSentEvent] = asyncio.Queue()
    _moved_turns(tab)  # what the page already shows
    tasks = [
        asyncio.create_task(_words(tab, out, last_event_id)),
        asyncio.create_task(_data(tab, out)),
    ]
    started = time.monotonic()
    max_s = web.settings.sse_max_s
    try:
        yield ServerSentEvent(event="hello", data="{}")
        while max_s is None or time.monotonic() - started < max_s:
            try:
                yield await asyncio.wait_for(out.get(), timeout=1.0)
            except TimeoutError:
                if await request.is_disconnected():
                    return
    finally:
        for task in tasks:
            task.cancel()
