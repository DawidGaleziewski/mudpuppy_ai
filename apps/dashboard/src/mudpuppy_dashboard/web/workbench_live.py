"""The live Workbench's projection (spec 075, the R-96 spike): one conversation as the shared state
the WebSocket sends (AG-UI `STATE_SNAPSHOT` / `STATE_DELTA`), its A2UI surfaces, and its messages.
The state's paths are the A2UI data model's (designer 19/13): `/view`, `/scans/{scan}/meter`,
`/pages`, `/narration`, `/stop`, `/graph`, `/commands/{id}`, `/choices/{id}`, `/ui/selected`, plus
the frame's `/portal`, `/portals`, `/stores`, `/personas` and `/live` (the conversation's scan).
Every number comes from the store; the model only chose components. Read-only, no SQL here."""

from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass, field
from typing import Any

from .. import (
    queries_app,
    queries_run_graph,
    queries_scans,
    queries_wb,
    status_map,
    stores,
    wb_a2ui,
    wb_render,
)
from ..map_layout import NODE_H, NODE_W
from ..queries_chat import list_personas
from ..queries_wb import WbConversation, WbTurn
from ..queries_wb_scan import ScanLive
from ..wb_frames import CommandCard
from .deps import Ctx
from .workbench_model import render_ctx

STAGE = "stage"  # the split layout's stage surface: the conversation's scan, live
ANSWERED = re.compile(r'^\[event\] The person answered "(.*)" \((\w+)\): .* \((.+)\)\.$')


@dataclass
class Projection:
    state: dict[str, Any]
    surfaces: dict[str, list[dict[str, Any]]]  # surface id -> its components, root first
    messages: list[dict[str, Any]] = field(default_factory=list)


def _page(p: Any, scan: ScanLive) -> dict[str, Any]:
    here = scan.here is not None and p.state_id == scan.here.state_id
    status = "failed" if p.failed else "here" if here and scan.status == "running" else "ok"
    return {
        "order": p.order,
        "route": p.route,
        "state": p.state,
        "title": p.title,
        "at": p.at,
        "step": p.step,
        "status": status,
        "sideTrips": p.side_pages,
    }


def _shown(vocabulary: str, value: str) -> dict[str, str | None]:
    s = status_map.status_of(vocabulary, value)
    return {"shape": s.shape, "word": s.word}


def _graph(conn: sqlite3.Connection, scan: ScanLive) -> dict[str, Any] | None:
    graph = queries_run_graph.run_graph(conn, scan.run_id)
    if graph is None:
        return None
    here = scan.here.route if scan.here else None
    return {
        "width": graph.width,
        "height": graph.height,
        "nodeW": NODE_W,
        "nodeH": NODE_H,
        "nodes": [
            {
                "id": n.id,
                "route": n.route,
                "title": n.title,
                "x": n.x,
                "y": n.y,
                "order": n.order,
                "status": n.status,
                "here": n.route == here,
                "stopped": n.stopped_here,
            }
            for n in graph.nodes
        ],
        "edges": [{"d": e.d, "kind": e.kind} for e in graph.edges if e.shown],
        "path": [n.id for n in graph.path],
    }


def scan_state(conn: sqlite3.Connection, scan: ScanLive) -> dict[str, Any]:
    """A scan as its components read it: meter, pages, narration, the stop, the graph."""
    stop = None
    if scan.status == "stopped":
        last = scan.events[-1] if scan.events else None
        stop = {
            "at": scan.ended_at,
            "route": scan.failed_at.route if scan.failed_at else None,
            "step": last.step if last else None,
            "reason": scan.stop_reason,
            "kept": {"pages": scan.pages, "queued": scan.queued},
            "checkpoint": {"route": scan.checkpoint} if scan.checkpoint else None,
        }
    return {
        "short": scan.short,
        "meter": {
            "status": scan.status,
            # mapped here, never in the console (status_map, skill mudpuppy-react-ui rule 4)
            "shown": _shown("wb_scan", scan.status),
            "steps": scan.steps,
            "limit": queries_scans.run_max_steps(conn, scan.run_id),
            "pages": scan.pages,
            "queued": scan.queued,
            "at": scan.here.route if scan.here else None,
        },
        "pages": [_page(p, scan) for p in scan.route_pages],
        "narration": [
            {"at": n.at, "text": n.text, "cites": [n.ref], "kind": n.kind}
            for n in wb_render.narration(scan)
        ][-20:],
        "stop": stop,
        "graph": _graph(conn, scan),
    }


def _command(card: CommandCard, command_id: str, name: str) -> dict[str, Any]:
    return {
        "commandId": command_id,
        "command": name,
        "label": card.title,
        "state": card.state,
        "shown": _shown("wb_cmd", card.state),
        "facts": [list(f) for f in card.facts],
        "reason": card.reason,
        "result": card.result,
        "links": [list(link) for link in card.result_links],
        "error": card.error if card.state == "failed" else None,
        "errorRef": card.error_ref,
        "running": card.running_word,
        "editable": card.editable,
        "args": card.args,
        "signIns": list(card.sign_ins),
        "personas": list(card.personas),
        "persona": card.persona,
        "askPersona": card.ask_persona,
        "undo": card.undo_url is not None,
    }


def _choice(
    choice: dict[str, Any], options: dict[str, list[dict[str, str]]], answers: dict[str, str]
) -> dict[str, Any]:
    kind = choice["kind"]
    return {
        "choiceId": choice["id"],
        "kind": kind,
        "question": choice["question"],
        "options": choice.get("options") or options.get(kind, []),
        "answer": answers.get(f"{choice['question']}|{kind}"),
    }


def _answers(turns: list[WbTurn]) -> dict[str, str]:
    """Answers already given ("[event] The person answered …"), by question and kind."""
    out: dict[str, str] = {}
    for t in turns:
        if t.is_event and (m := ANSWERED.match(t.asked)):
            out[f"{m.group(1)}|{m.group(2)}"] = m.group(3)
    return out


def _options(c: Ctx, conn: sqlite3.Connection, portal: str) -> dict[str, list[dict[str, str]]]:
    """What a portal, store or persona choice offers (the server's lists, never the model's)."""
    portals = queries_app.portal_list(conn, c.settings.portals_dir, c.env).portals
    every = stores.list_stores(c.settings.data_dir, c.settings.eval_root)
    return {
        "portal": [{"value": p.id, "label": p.id} for p in portals],
        # only stores that hold the portal: the console moves any other back (R-71 (d), F-10)
        "store": [
            {"value": s.key, "label": s.label} for s in stores.stores_with_portal(every, portal)
        ],
        "persona": [
            {"value": p.id, "label": p.id} for p in list_personas(c.settings.personas_dir, portal)
        ],
    }


def _live_scan(turns: list[WbTurn], bound: list[str]) -> str | None:
    """The conversation's scan: the newest one a confirmed start began, else the newest it binds."""
    for t in reversed(turns):
        for cmd in reversed(t.commands):
            run = cmd.result.get("run_id")
            if (
                cmd.command in ("scan.start", "scan.resume")
                and cmd.state == "done"
                and isinstance(run, str)
            ):
                return run
    return bound[-1] if bound else None


def _turn_surface(rt: wb_render.RenderedTurn, view_ids: set[str]) -> list[dict[str, Any]]:
    """A turn's surface: a started scan's live map first (R-103 (10)), the compiled view, a
    stopped scan's error card (WB-UI-22), the turn's command cards and choices."""
    t = rt.turn
    first: list[dict[str, Any]] = []
    comps: list[dict[str, Any]] = []
    if t.view is not None and not t.view.fallback:
        comps = wb_a2ui.compile_view(t.view.spec)[1:]
    for card in rt.cards:
        own = card.frame.dom_id.removeprefix(f"t{t.n}-")
        # a started scan's live map is the stage's in the live Workbench, not a card again
        if own in view_ids or card.scan is None or own.startswith("live-"):
            continue
        compiled = wb_a2ui.compile_component(
            {"id": own[:24], "type": card.type, "bind": {"scan": card.scan.run_id}}
        )
        if compiled is not None:
            (first if own.startswith("live-") else comps).append(compiled)
    comps = [*first, *comps]
    comps += [wb_a2ui.command_card(c.id, c.command) for c in t.commands]
    comps += [wb_a2ui.choice_card(ch["id"]) for ch in t.choices]
    if not comps:
        return []
    spec = t.view.spec if t.view is not None and not t.view.fallback else {}
    root = wb_a2ui.view_root(
        spec.get("path", "chat"), spec.get("why"), [c["id"] for c in comps], spec.get("suggestions")
    )
    return [root, *comps]


def _messages(turns: list[WbTurn]) -> list[dict[str, Any]]:
    """The conversation as AG-UI messages, each with the turn it belongs to (its surface `t{n}`)."""
    out: list[dict[str, Any]] = []
    for t in turns:
        role = "system" if t.is_event else "user"
        out.append({"id": f"t{t.n}-asked", "role": role, "content": t.asked, "turn": t.n})
        out += [
            {"id": f"t{t.n}-a{i}", "role": "assistant", "content": a, "turn": t.n}
            for i, a in enumerate(t.answer)
        ]
        out += [
            {"id": f"t{t.n}-n{i}", "role": "system", "content": n, "turn": t.n}
            for i, n in enumerate(t.notices)
        ]
    return out


def project(
    c: Ctx,
    conn: sqlite3.Connection,
    conv: WbConversation,
    selected: dict[str, Any] | None,
    paused: str | None,
) -> Projection:
    rc = render_ctx(c, conn, conv, {})
    turns = queries_wb.turns(conn, conv.id)
    with_cards = [t.n for t in turns if t.view is not None and not t.view.fallback]
    rendered = [
        wb_render.render_turn(rc, t, newer_cards=any(n > t.n for n in with_cards)) for t in turns
    ]
    surfaces: dict[str, list[dict[str, Any]]] = {}
    commands: dict[str, Any] = {}
    options = _options(c, conn, conv.portal)
    answers = _answers(turns)
    choices: dict[str, Any] = {}
    for rt in rendered:
        t = rt.turn
        view_ids = {comp["id"] for comp in (t.view.spec.get("components", []) if t.view else [])}
        if comps := _turn_surface(rt, view_ids):
            surfaces[f"t{t.n}"] = comps
        for cmd, card in zip(t.commands, rt.commands, strict=True):
            commands[wb_a2ui.command_id(cmd.id)] = _command(card, cmd.id, cmd.command)
        for ch in t.choices:
            choices[wb_a2ui.choice_id(ch["id"])] = _choice(ch, options, answers)
    live = _live_scan(turns, rc.bound)
    scans: dict[str, Any] = {}
    for run_id in {*rc.bound, *([live] if live else [])}:
        if (scan := rc.scan(run_id)) is not None:
            scans[run_id] = scan_state(conn, scan)
    if live in scans:
        stage = [
            wb_a2ui.compile_component({"id": k, "type": t, "bind": {"scan": live}})
            for k, t in (("meter", "ScanMeter"), ("map", "LiveMap"), ("story", "Narration"))
        ]
        parts = [s for s in stage if s is not None]
        surfaces[STAGE] = [wb_a2ui.view_root("mapping", None, [s["id"] for s in parts]), *parts]
    state = {
        "view": {"phase": 1, "generated": True},
        "conversation": {"id": conv.id, "portal": conv.portal, "path": conv.path},
        "portal": {"id": conv.portal, "store": c.store.key, "environment": c.env, "paused": paused},
        "options": options,
        "live": live if live in scans else None,
        "scans": scans,
        "commands": commands,
        "choices": choices,
        "ui": {"selected": selected},
    }
    return Projection(state=state, surfaces=surfaces, messages=_messages(turns))
