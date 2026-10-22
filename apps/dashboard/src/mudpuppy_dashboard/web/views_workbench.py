"""Workbench page model and chat calls (spec 043), shared by the Workbench routers (G-13: a router
never imports another). The page renders from the store; every write and the assistant's words go
through the chat service (D-2)."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote

from .. import chat_client, queries_wb, wb_render
from ..queries_wb import WbConversation
from ..queries_wb_scan import PageVisit, ScanLive, resolve_scan
from ..wb_render import RenderedTurn
from .deps import Ctx, Web

STARTERS = ("Start a map scan", "Which processes are accepted?", "What does the portal look like?")


@dataclass
class WbPage:
    portal: str | None
    conversation: WbConversation | None = None
    turns: list[RenderedTurn] = field(default_factory=list)
    sel: str | None = None
    sheet: tuple[ScanLive, PageVisit] | None = None
    why: str | None = None  # the latest view's reason, shown next to the Path switch
    starters: tuple[str, ...] = STARTERS
    recent: list[tuple[WbConversation, str]] = field(default_factory=list)
    blocked: str | None = None  # why the composer is off (model down, the day's cap)
    notice: str | None = None  # As of ≠ Now
    live: ScanLive | None = None  # the running scan the live bar pins (WB-UI-16)
    live_card: str | None = None  # the dom id of its latest live card
    ask: str = ""  # a message an entry filled in (Scans: "Watch scan …", D-10)


def live_of(turns: list[RenderedTurn]) -> tuple[ScanLive | None, str | None]:
    """The latest live card of a running scan, for the live bar."""
    for rt in reversed(turns):
        for card in rt.cards:
            if card.type == "LiveMap" and card.scan is not None and card.scan.status == "running":
                return card.scan, card.frame.dom_id
    return None, None


async def chat(web: Web, method: str, path: str, body: object | None = None) -> tuple[int, Any]:
    """One chat-service call; ChatUnavailable when it is not running."""
    return await chat_client.call(web.settings, method, path, body, web.chat_transport)


def cmd_path(command_id: str, action: str) -> str:
    return f"/workbench/commands/{quote(command_id, safe='')}/{action}"


async def tokens_for(web: Web, commands: list[queries_wb.WbCommand]) -> dict[str, str]:
    """A fresh one-time token for each proposed card on screen (the previous one stops working)."""
    tokens: dict[str, str] = {}
    for cmd in commands:
        if cmd.state != "proposed":
            continue
        try:
            status, reply = await chat(web, "POST", cmd_path(cmd.id, "token"), {})
        except chat_client.ChatUnavailable:
            return tokens
        if status == 200 and isinstance(reply, dict) and isinstance(reply.get("token"), str):
            tokens[cmd.id] = reply["token"]
    return tokens


def render_ctx(
    c: Ctx, conn: sqlite3.Connection, conv: WbConversation, tokens: dict[str, str]
) -> wb_render.Ctx:
    bound = queries_wb.bound_scans(conn, conv.id)
    rc = wb_render.Ctx(
        conn=conn,
        portal=conv.portal,
        env=c.env,
        viewer=c.settings.reviewer,
        url=c.url,
        tokens=tokens,
    )
    rc.bound = [r for s in bound if (r := resolve_scan(conn, conv.portal, s))]
    return rc


def rendered_turns(rc: wb_render.Ctx, turns: list[queries_wb.WbTurn]) -> list[RenderedTurn]:
    """Every turn rendered; a stopped live card folds when a later turn has a card (WB-UI-40)."""
    with_cards = [t.n for t in turns if t.view is not None and not t.view.fallback]
    return [
        wb_render.render_turn(rc, t, newer_cards=any(n > t.n for n in with_cards)) for t in turns
    ]


def sheet_of(rc: wb_render.Ctx, sel: str | None) -> tuple[ScanLive, PageVisit] | None:
    """The selected page (`route:state` of a bound scan) for the side sheet (WB-UI-07)."""
    if not sel or ":" not in sel:
        return None
    route, _, state = sel.rpartition(":")
    for run_id in rc.bound:
        scan = rc.scan(run_id[:8])
        page = (
            next((p for p in scan.route_pages if p.route == route and str(p.state) == state), None)
            if scan
            else None
        )
        if scan and page:
            return scan, page
    return None


async def blocked_reason(web: Web) -> str | None:
    """Why the composer is off: the model switched off, or the day's turns used up (WB-UI-33)."""
    if not web.settings.workbench_model:
        return "Assistant unavailable — the live map still updates."
    try:
        status, usage = await chat(web, "GET", "/workbench/usage")
    except chat_client.ChatUnavailable:
        return "Assistant unavailable — the live map still updates. Start the chat service."
    if (
        status == 200
        and isinstance(usage, dict)
        and usage.get("turns_today", 0) >= usage.get("cap", 1)
    ):
        return f"The day's {usage.get('cap')} Workbench turns are used up."
    return None


def page_model(
    c: Ctx,
    conn: sqlite3.Connection,
    conv: WbConversation | None,
    sel: str | None,
    tokens: dict[str, str],
) -> WbPage:
    portal = conv.portal if conv else c.portal
    page = WbPage(portal=portal, conversation=conv, sel=sel)
    if portal:
        page.recent = queries_wb.recent(conn, portal)
    if conv is None:
        return page
    rc = render_ctx(c, conn, conv, tokens)
    turns = queries_wb.turns(conn, conv.id)
    page.turns = rendered_turns(rc, turns)
    page.live, page.live_card = live_of(page.turns)
    page.sheet = sheet_of(rc, sel)
    latest = next((t.view for t in reversed(turns) if t.view and not t.view.fallback), None)
    page.why = latest.why if latest else None
    if c.as_of is not None:
        page.notice = "The Workbench works on now. Commands are off while As of is set."
    return page
