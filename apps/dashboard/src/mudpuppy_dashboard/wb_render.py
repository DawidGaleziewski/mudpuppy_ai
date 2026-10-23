"""Workbench rendering (spec 043 T030–T037; designer 14-workbench.md § 3, 16-genui-components.md):
a stored view spec becomes frames with data from our stores, placed by the server (phase 1:
every component a card in the assistant's message, Narration its own message, PageDetail in the
side sheet). The model's words reach the templates as plain strings only (FR-003)."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field, replace
from typing import Any

from . import queries_wb, queries_wb_scan
from .queries_wb import RecordRow, WbCommand, WbTurn, WbView
from .queries_wb_scan import PageVisit, ScanEvent, ScanLive
from .wb_frames import CommandCard, Feedback, Frame, WhyFacts, clock

PHASE_PATHS = ("chat", "mapping")  # phase 1 (D-4)
LIVE_TYPES = ("LiveMap", "ScanMeter")
TITLES = {
    "LiveMap": "Live map",
    "ScanMeter": "Scan",
    "ErrorCard": "Scan stopped",
    "RecordCard": "Record",
    "RecordList": "Records",
}
SHOWS = {
    "LiveMap": "Live map of scan {scan} as a filmstrip, with its meter",
    "ScanMeter": "Steps, pages and queued links of scan {scan}",
    "PageMiniature": "One page of scan {scan}",
    "ErrorCard": "What failed in scan {scan}, where, and what is kept",
    "RecordCard": "Record {record}",
    "RecordList": "{n} records",
    "Narration": "What the crawler did, in plain words",
    "PageDetail": "The selected page",
}


@dataclass
class Card:
    """One placed component: its frame and the data its partial needs."""

    frame: Frame
    type: str
    scan: ScanLive | None = None
    page: PageVisit | None = None
    record: RecordRow | None = None
    records: list[tuple[str, RecordRow | None]] = field(default_factory=list)
    folded: bool = False
    title_prop: str | None = None
    turn: int = 0


@dataclass
class NarrationLine:
    at: str
    text: str
    ref: str
    step: int
    kind: str  # visit · milestone · stop · live


@dataclass
class RenderedTurn:
    turn: WbTurn
    cards: list[Card]
    narration: list[NarrationLine]
    narration_scan: str | None
    suggestions: list[str]
    commands: list[CommandCard]


@dataclass
class Ctx:
    """What rendering needs beyond the view: the store, the portal, the viewer, links."""

    conn: sqlite3.Connection
    portal: str
    env: str
    viewer: str | None
    tokens: dict[str, str] = field(default_factory=dict)  # proposed command id -> its token
    scans: dict[str, ScanLive | None] = field(default_factory=dict)  # full scan id -> scan (cache)
    bound: list[str] = field(default_factory=list)  # run ids the conversation binds
    personas: tuple[str, ...] = ()  # the portal's persona ids, for a Start card (spec 044)
    sign_ins: tuple[str, ...] = ()  # credential names a new persona can use (spec 072)

    def scan(self, scan_id: str) -> ScanLive | None:
        if scan_id not in self.scans:
            run = queries_wb_scan.resolve_scan(self.conn, self.portal, scan_id)
            self.scans[scan_id] = queries_wb_scan.scan_live(self.conn, run) if run else None
        return self.scans[scan_id]


def _source(card_type: str, scan: ScanLive | None) -> str:
    if scan is None or card_type in ("RecordCard", "RecordList"):
        return "Portal model · now"
    last = scan.events[-1].at if scan.events else scan.started_at
    if scan.status == "running":
        return f"Live · events up to {clock(last)}"
    return f"From events up to {clock(last)}"


def _shows(spec: dict[str, Any]) -> tuple[str, ...]:
    out = []
    for c in spec.get("components", []):
        bind = c.get("bind", {})
        text = SHOWS.get(c.get("type", ""), c.get("type", ""))
        out.append(
            text.format(
                scan=bind.get("scan", ""),
                record=bind.get("record", ""),
                n=len(bind.get("records", [])),
            )
        )
    return tuple(out)


def why_of(view: WbView, turn: WbTurn, scan: ScanLive | None) -> WhyFacts:
    data = "Portal model, now"
    if scan is not None:
        data = f"Events of scan {scan.short}" + (", live" if scan.status == "running" else "")
    return WhyFacts(
        path=view.path,
        by_you=False,
        because=view.why,
        asked="" if turn.is_event else turn.asked,
        shows=_shows(view.spec),
        data=data,
        other_paths=tuple(p for p in PHASE_PATHS if p != view.path),
    )


def _page(scan: ScanLive | None, bind_page: Any) -> PageVisit | None:
    if scan is None or not isinstance(bind_page, dict):
        return None
    route, state = bind_page.get("route"), bind_page.get("state", 1)
    return next((p for p in scan.route_pages if p.route == route and p.state == state), None)


def _card(rc: Ctx, comp: dict[str, Any], dom_id: str) -> Card:
    kind = comp["type"]
    bind = comp.get("bind", {})
    scan = rc.scan(bind["scan"]) if isinstance(bind.get("scan"), str) else None
    title = TITLES.get(kind, kind)
    card = Card(
        frame=Frame(dom_id=dom_id, title=title, source=_source(kind, scan), card=True),
        type=kind,
        scan=scan,
    )
    if kind == "PageMiniature":
        card.page = _page(scan, bind.get("page"))
        title = card.page.route if card.page else str(bind.get("page", {}).get("route", "Page"))
        card.frame = Frame(dom_id, title, card.frame.source, title_mono=True, card=True)
    elif kind == "RecordCard":
        card.record = queries_wb.records(rc.conn, rc.portal, [bind["record"]]).get(bind["record"])
    elif kind == "RecordList":
        keys = list(bind.get("records", []))
        found = queries_wb.records(rc.conn, rc.portal, keys)
        card.records = [(k, found.get(k)) for k in keys]
        card.title_prop = (comp.get("props") or {}).get("title")
        card.frame = Frame(dom_id, card.title_prop or title, card.frame.source, card=True)
    return card


def _with_status(card: Card) -> Card:
    """Live frames carry the scan's status; an ErrorCard is red (an action really failed)."""
    f = card.frame
    if card.type in LIVE_TYPES and card.scan is not None:
        card.frame = Frame(f.dom_id, f.title, f.source, card=True, status=card.scan.status)
    if card.type == "ErrorCard" and card.scan is not None and card.scan.failed_at is not None:
        title = f"Next action failed at {card.scan.failed_at.route}"
        card.frame = Frame(f.dom_id, title, f.source, card=True, failure=True)
    return card


def _lead(cards: list[Card], view: WbView, turn: WbTurn, rc: Ctx) -> None:
    """The first card carries Why this view? and Right view? (WB-UI-26)."""
    if not cards:
        return
    first = cards[0]
    value, reasons = queries_wb.feedback(rc.conn, view.id, rc.viewer)
    f = first.frame
    first.frame = Frame(
        f.dom_id,
        f.title,
        f.source,
        title_mono=f.title_mono,
        card=f.card,
        failure=f.failure,
        status=f.status,
        why=why_of(view, turn, first.scan),
        feedback=Feedback(f"/api/workbench/views/{view.id}/feedback", value, reasons),
    )


def narration(scan: ScanLive) -> list[NarrationLine]:
    """Templated lines (WB-UI-17…19, FR-009): one per route page and milestone, each citing it."""
    by_step = {p.step: p for p in scan.route_pages}
    lines: list[NarrationLine] = []
    for e in scan.events:
        line = _line(scan, e, by_step.get(e.step))
        if line is not None:
            lines.append(line)
    if scan.status == "running" and lines and lines[-1].kind == "visit":
        lines[-1].kind = "live"
    return lines


def _line(scan: ScanLive, e: ScanEvent, page: PageVisit | None) -> NarrationLine | None:
    ref = e.ref(scan.run_id)
    if e.type == "scan.started":
        return NarrationLine(e.at, f"Scan {scan.short} started.", ref, e.step, "milestone")
    if e.type == "page.visited" and page is not None:
        side = f" (+{page.side_pages} side pages)" if page.side_pages else ""
        text = f"Opened {page.route} — {page.title}.{side}"
        return NarrationLine(e.at, text, ref, e.step, "visit")
    if e.type == "scan.stopped":
        where = f" at {scan.failed_at.route}" if scan.failed_at else ""
        return NarrationLine(e.at, f"The scan stopped{where}.", ref, e.step, "stop")
    if e.type == "scan.finished":
        text = f"The scan finished: {scan.pages} pages."
        return NarrationLine(e.at, text, ref, e.step, "milestone")
    return None


def render_turn(rc: Ctx, turn: WbTurn, newer_cards: bool) -> RenderedTurn:
    """A turn's view placed for phase 1, its narration, suggestions and command cards."""
    cards: list[Card] = []
    narr: list[NarrationLine] = []
    narr_scan: str | None = None
    suggestions: list[str] = []
    view = turn.view
    if view is not None and not view.fallback:
        comps = view.spec.get("components", [])
        for comp in comps:
            if comp["type"] == "Narration":
                scan = rc.scan(comp["bind"]["scan"])
                narr, narr_scan = (narration(scan), scan.short) if scan else ([], None)
            elif comp["type"] != "PageDetail":
                cards.append(_with_status(_card(rc, comp, f"t{turn.n}-{comp['id']}")))
        cards = _standing_reaction(rc, turn.n, cards, comps)
        for card in cards:
            card.turn = turn.n
            done = card.scan is not None and card.scan.status != "running"
            card.folded = card.type in LIVE_TYPES and done and newer_cards
        _lead(cards, view, turn, rc)
        suggestions = list(view.spec.get("suggestions", []))
    commands = [command_card(rc, c) for c in turn.commands]
    return RenderedTurn(turn, cards, narr, narr_scan, suggestions, commands)


def _standing_reaction(
    rc: Ctx, n: int, cards: list[Card], comps: list[dict[str, Any]]
) -> list[Card]:
    """WB-UI-22: a bound scan that stopped on a failure gets its ErrorCard in the view."""
    if any(c["type"] == "ErrorCard" for c in comps):
        return cards
    for card in cards:
        scan = card.scan
        if card.type in LIVE_TYPES and scan is not None and scan.failed_at is not None:
            err = _card(rc, {"type": "ErrorCard", "bind": {"scan": scan.run_id}}, f"t{n}-err")
            return [*cards, _with_status(err)]
    return cards


def _scan_facts(rc: Ctx, scan_id: str) -> tuple[ScanLive | None, str]:
    scan = rc.scan(scan_id) if scan_id else None
    kept = f"{scan.pages} pages, {scan.queued} queued links" if scan else "—"
    return scan, kept


def _persona_card(rc: Ctx, cmd: WbCommand) -> CommandCard:
    """Add a persona (spec 072, designer 19/04): an editable card; its fields are the args."""
    facts = (
        ("Adds", f"a persona to {rc.portal}"),
        ("Where", rc.env),
        ("Undo", "Undo removes the persona until a scan uses it."),
    )
    card = _card_of(rc, cmd, facts)
    undo = f"/api/workbench/commands/{cmd.id}/undo" if cmd.state == "done" else None
    return replace(
        card,
        editable=True,
        args=dict(cmd.args),
        sign_ins=rc.sign_ins,
        personas=rc.personas,
        undo_url=undo,
    )


def command_card(rc: Ctx, cmd: WbCommand) -> CommandCard:
    """A command card with its facts in the designer's order (§ 5.12) and its state's words."""
    if cmd.command == "persona.add":
        return _persona_card(rc, cmd)
    scan_id = str(cmd.args.get("scan", ""))
    scan, kept = _scan_facts(rc, scan_id)
    short = queries_wb_scan.short_id(scan_id)
    facts: tuple[tuple[str, str], ...]
    if cmd.command == "scan.resume":
        start = f"{scan.checkpoint} (last good checkpoint)" if scan and scan.checkpoint else "—"
        facts = (
            ("Starts", f"a new scan that continues {short}"),
            ("From", start),
            ("Kept", kept),
            ("Where", rc.env),
            ("Undo", "Not undoable. You can stop the new scan."),
        )
    elif cmd.command == "scan.stop":
        facts = (
            ("Stops", f"scan {short}"),
            ("Kept", "Recorded pages and the queue"),
            ("Undo", "Not undoable. Resume continues from the last checkpoint."),
        )
    else:
        continues = cmd.args.get("type") == "continue_frontier"
        what = "a scan that continues the queue" if continues else "a full map scan"
        facts = (
            ("Starts", f"{what} of {rc.portal}"),
            ("Where", rc.env),
            ("Undo", "Not undoable. You can stop it."),
        )
        if not continues:
            return replace(_card_of(rc, cmd, facts), **_persona_choice(rc))
    return _card_of(rc, cmd, facts)


def _persona_choice(rc: Ctx) -> dict[str, Any]:
    """A Start card's "As" choice (spec 044 FR-001…FR-003): the portal's personas, the newest
    scan's selected first, else `guest`, else the first; none → a link to add one instead."""
    if not rc.personas:
        return {"ask_persona": True, "no_persona_url": f"/app/portals/{rc.portal}/settings"}
    newest = queries_wb.newest_persona(rc.conn, rc.portal)
    first = next((p for p in (newest, "guest") if p in rc.personas), rc.personas[0])
    return {"ask_persona": True, "personas": rc.personas, "persona": first}


LABELS = {
    "scan.start": "Start a map scan",
    "scan.resume": "Resume from last checkpoint",
    "scan.stop": "Stop the scan",
    "persona.add": "Add a persona",
}
RUNNING = {
    "scan.start": "Starting…",
    "scan.resume": "Resuming…",
    "scan.stop": "Stopping…",
    "persona.add": "Adding…",
}


def _persona_result(rc: Ctx, cmd: WbCommand) -> tuple[str, tuple[tuple[str, str], ...]]:
    name = str(cmd.result.get("persona") or cmd.args.get("name", ""))
    if cmd.state == "undone":
        return f"Persona {name} removed from {rc.portal}.", ()
    if cmd.state != "done":
        return "", ()
    signs_in = " can now sign in as" if cmd.args.get("credential") else " can now browse as"
    settings = f"/app/portals/{rc.portal}/settings"
    return f"Persona {name} added to {rc.portal}. Scans on {rc.env}{signs_in} {name}.", (
        ("Open in Settings ▸ Personas", settings),
    )


def _result(rc: Ctx, cmd: WbCommand) -> tuple[str, tuple[tuple[str, str], ...]]:
    run = cmd.result.get("run_id")
    if cmd.state == "expired":
        return str(cmd.result.get("why", "it no longer applies")), ()
    if cmd.command == "persona.add":
        return _persona_result(rc, cmd)
    if cmd.state != "done" or not isinstance(run, str):
        return "", ()
    if cmd.command == "scan.stop":
        return f"Stopped scan {queries_wb_scan.short_id(run)}.", ()
    return f"Started scan {queries_wb_scan.short_id(run)}.", (
        ("Open in Scans", f"/app/scans/{run}"),
    )


def _card_of(rc: Ctx, cmd: WbCommand, facts: tuple[tuple[str, str], ...]) -> CommandCard:
    result, links = _result(rc, cmd)
    base = f"/api/workbench/commands/{cmd.id}"
    return CommandCard(
        dom_id=f"cmd-{cmd.id}",
        title=LABELS.get(cmd.command, cmd.command),
        state=cmd.state,
        facts=facts,
        reason=cmd.reason,
        proposed_by=cmd.source,
        confirm_url=f"{base}/confirm",
        cancel_url=f"{base}/cancel",
        token=rc.tokens.get(cmd.id),
        result=result,
        result_links=links,
        error=str(cmd.result.get("message", "The command failed.")).rstrip(".") + ".",
        error_ref=cmd.error_ref,
        running_word=RUNNING.get(cmd.command, "Running…"),
    )
