"""MudPuppy Workbench — reference app (Starlette + Jinja2 + htmx + SSE). Run:  uvicorn app:app --reload

One rule shapes the wiring: HTTP responses carry headers (HX-Push-Url, HX-Replace-Url); every change to the page
goes through ONE ordered stream per conversation (words lane + data lane), as htmx out-of-band swaps. So a view never
arrives before its layout, and a data event never targets a region that isn't on the page yet.

Read top to bottom: state → helpers → views → the words lane (turns) → the data lane (stream, hooks) → commands → routes.
Everything is in memory; see README.md for what to replace in production.
"""
import asyncio
import json
import logging
import os
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path

from starlette.applications import Starlette
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse, Response, StreamingResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

import catalogue as cat
import fixture as fx
from assistant import Context, make_assistant
from commands import Commands
from events import Engine, scan_state, sse
from render import Renderer, env

HERE = Path(__file__).resolve().parent
PKG = HERE.parent.parent                                   # the design package root (design-system/, screens/, …)
PHASE = int(os.environ.get("WB_PHASE", "2"))              # rollout phase shown by default (1 inline · 2 split · 3 focus + explain)
STILL_WORKING_S = 4                                       # nothing started 4 s after Send → "Still working"
VIEW_DEADLINE_S = 15                                      # a view not finished 15 s after it started is dropped
TURN_DEADLINE_S = 30
HEARTBEAT_S = 15
log = logging.getLogger("workbench")
logging.basicConfig(level=logging.INFO, format="%(message)s")


# ---------------------------------------------------------------- state
@dataclass
class View:
    id: str
    tid: str                  # the turn that hosts it; frame ids are f"{tid}-{component id}"
    spec: dict
    path: str
    why: str
    path_source: str          # "assistant" | "you"
    origin: str               # "assistant" (model) | "workbench" (default view for a path, no model call)
    asked: str | None
    scan: str | None
    dropped: list
    slots_then: dict
    after: str | None         # the data-lane event this view was rendered with
    sel: str | None = None
    sheet_by: str = "assistant"   # who opened the side sheet: "assistant" (generated) | "you" (a click, not generated)


@dataclass
class Turn:
    id: str                   # "t3": also the DOM id; slots are t3--text, t3--cmds, t3--view
    role: str                 # "user" | "assistant" | "system"
    text: str = ""
    chips: list = field(default_factory=list)
    view_id: str | None = None
    commands: list = field(default_factory=list)
    note: str | None = None
    status: str | None = None     # "Still working"
    composing: bool = False


@dataclass
class Session:
    id: str
    csrf: str = field(default_factory=lambda: secrets.token_urlsafe(16))
    phase: int = PHASE
    focus: bool = False
    as_of: str = "now"
    sheet_open: bool = True
    turns: list = field(default_factory=list)
    views: dict = field(default_factory=dict)
    current: str | None = None
    outbox: list = field(default_factory=list)     # ordered HTML for the stream (out-of-band swaps)


SESSIONS: dict[str, Session] = {}
TELEMETRY: list[dict] = []
engine = Engine()
assistant = make_assistant()


def track(kind, **kw):
    rec = dict(kind=kind, at=round(time.time(), 3), **kw)
    TELEMETRY.append(rec)
    log.info(json.dumps(rec, default=str, ensure_ascii=False))


# ---------------------------------------------------------------- helpers
def session(request, create=False):
    sid = request.cookies.get("wb_sid")
    if sid in SESSIONS:
        return SESSIONS[sid]
    if create:
        s = Session(id=secrets.token_urlsafe(12))
        SESSIONS[s.id] = s
        return s
    return None


def renderer(sess):
    return Renderer(sess, engine, commands, sess.csrf)


def resolve(kind, value):
    """Do the ids in a spec exist? (Production: look them up in the portal model, as of Now, for this person.)"""
    if kind == "scan":
        return value in (fx.SCAN, fx.RESUMED_SCAN)
    if kind == "page":
        return fx.find_page(value["route"], value.get("state")) is not None
    return value in {"record": fx.RECORDS, "rule": fx.RECORDS, "change": fx.CHANGES, "finding": fx.FINDINGS}[kind]


def is_hx(request):
    return request.headers.get("hx-request") == "true" and request.headers.get("hx-history-restore-request") != "true"


def csrf_ok(request, sess):
    return sess is not None and secrets.compare_digest(request.headers.get("x-csrf-token", ""), sess.csrf)


def append_turn(sess, role, **kw):
    t = Turn(id=f"t{len(sess.turns) + 1}", role=role, **kw)
    sess.turns.append(t)
    return t


async def push(sess, html):
    """Queue HTML for the conversation's stream. Synchronous append: nothing can slip in between."""
    sess.outbox.append(html)
    await engine.notify()


def oob(target_id, html, how="innerHTML"):
    return f'<div id="{target_id}" hx-swap-oob="{how}">{html}</div>'


def oob_turns(sess, turns):
    """Append turns to the log (and, in focus mode, show the latest reply above the command bar)."""
    r = renderer(sess)
    html = '<div hx-swap-oob="beforeend:#wb-log">' + "".join(r.turn(t) for t in turns) + "</div>"
    if r.layout_of(r.view) == "focus":
        last = [t for t in turns if t.role != "user"][-1:]
        if last:
            html += oob("wb-reply", r.turn(last[0]) + '<a class="sy-small" href="/workbench?focus=0">Show the conversation '
                        f'({len(sess.turns)} messages)</a>')
    return html


def oob_turn_slot(sess, t, slot):
    r = renderer(sess)
    body = {"text": lambda: r.render("frames/turn_text.html.j2", t=t),
            "cmds": lambda: "".join(r.command(commands.items[c]) for c in t.commands),
            "view": lambda: r.view_slot(t)}[slot]()
    return oob(f"{t.id}--{slot}", body)


ANNOUNCE_VIEW = {"mapping": "Live map opened", "troubleshoot": "Troubleshoot view opened", "explain": "Explain view opened"}


# ---------------------------------------------------------------- views
def new_view(sess, spec, *, tid, origin, asked=None, path_source="assistant", dropped=()):
    """Make a checked spec the current view. Call push(show_view(...)) right after, with no await in between."""
    scans = [c["bind"]["scan"] for c in spec["components"] if "scan" in c["bind"]]
    scan = scans[0] if scans else None
    layout = cat.layout_for(spec["path"], sess.phase, sess.focus)
    prev = sess.views.get(sess.current)
    v = View(id=f"v{len(sess.views) + 1}", tid=tid, spec=spec, path=spec["path"], why=spec["why"], path_source=path_source,
             origin=origin, asked=asked, scan=scan, dropped=list(dropped), slots_then=cat.place(spec, layout),
             after=engine.last_id(scan) if scan else None)
    sess.views[v.id] = v
    sess.current = v.id
    sess.sheet_open = True
    track("view.rendered", view=v.id, path=v.path, origin=origin, components=[c["type"] for c in spec["components"]],
          dropped=[d.code for d in v.dropped])
    return v, prev


def show_view(sess, v, prev):
    """Out-of-band swaps that put a new view on the page: fold the previous one, swap the layout (log and composer are
    preserved), fill this turn's view slot, update the path switch and suggestions, announce it once."""
    r = renderer(sess)
    parts = []
    if prev:
        parts.append(oob(f"{prev.tid}--view", r.view_slot(next(t for t in sess.turns if t.id == prev.tid))))
    parts.append(r.layout_html(oob=True))
    parts.append(oob(f"{v.tid}--view", r.view_slot(next(t for t in sess.turns if t.id == v.tid))))
    parts.append(r.pathswitch(oob=True))
    parts.append(r.render("frames/suggest.html.j2", items=v.spec.get("suggestions", []), oob=True))
    if v.path in ANNOUNCE_VIEW:
        parts.append(oob("wb-announce", ANNOUNCE_VIEW[v.path]))
    return "".join(parts)


def default_spec(path, scan_id):
    """The view a path gets without asking the model (path switch, links, reload). Deterministic."""
    if path == "mapping":
        scan_id = scan_id or fx.SCAN
    st = scan_state(engine, scan_id) if scan_id else None
    why, comps, sugg = f"You switched to {cat.PATH_LABEL[path]}.", [], []
    if path == "mapping":
        stopped = st["status"] == "stopped"
        comps = [{"id": "map", "type": "LiveMap", "bind": {"scan": scan_id}, "props": {"follow": not stopped}}]
        if stopped and st["error"]:
            comps.append({"id": "err", "type": "ErrorCard", "bind": {"scan": scan_id}})
        comps.append({"id": "detail", "type": "PageDetail", "bind": {"scan": scan_id, "page": "@selected"}})
        if not stopped:
            comps.append({"id": "story", "type": "Narration", "bind": {"scan": scan_id}})
    elif path == "troubleshoot":
        if st and st["stop_step"] and st["error"]:
            s = st["stop_step"]
            comps = [{"id": "shot", "type": "StepShot", "bind": {"scan": scan_id, "step": s}},
                     {"id": "tail", "type": "EventTail", "bind": {"scan": scan_id, "step": s}, "props": {"count": 5}},
                     {"id": "fixes", "type": "FixChoices", "bind": {"scan": scan_id, "step": s}},
                     {"id": "tries", "type": "AttemptList", "bind": {"scan": scan_id, "step": s}}]
        else:
            why, sugg = "Nothing has stopped, so there is nothing to troubleshoot.", ["Map the OC/AC calculator"]
    elif path == "explain":
        sugg = ["Explain the banner on wynik", "Show BR-021"]
    return {"version": "1", "path": path, "why": why, "components": comps, "suggestions": sugg}


async def switch_path(sess, path, scan_id, sel=None, text=None, why=None, path_source="you"):
    """A view composed by the Workbench (no model call): path switch, link, continuation."""
    checked = cat.check_view(default_spec(path, scan_id), sess.phase, resolve)
    if why:
        checked.spec["why"] = why
    turn = append_turn(sess, "system", text=text or f"Switched to {cat.PATH_LABEL[path]}.")
    v, prev = new_view(sess, checked.spec, tid=turn.id, origin="workbench", path_source=path_source, dropped=checked.dropped)
    v.sel = sel
    turn.view_id = v.id
    await push(sess, oob_turns(sess, [turn]) + show_view(sess, v, prev))
    return v


def precondition(raw):
    """Is the command possible right now? Returns a plain sentence when it isn't. (Beta: sandbox only.)"""
    a, name = raw.get("args") or {}, raw.get("command")
    st = scan_state(engine, a["scan"]) if resolve("scan", a.get("scan")) else None
    if name == "scan.resume" and not (st and st["status"] == "stopped" and not st["continued_by"]):
        return f"I can't resume {a.get('scan')}: it isn't stopped, or it was already continued."
    if name == "scan.stop" and not (st and st["status"] == "running"):
        return f"I can't stop {a.get('scan')}: it isn't running."
    if name == "path.attempt" and not (st and st["error"] and st["stop_step"] == a.get("step")):
        return f"I can't retry step {a.get('step')}: it didn't fail."
    return None


def propose(raw, source):
    blocked = precondition(raw)
    cmd, why = (None, blocked) if blocked else commands.propose(raw, source=source)
    if not cmd:
        track("command.refused", reason=why)
        return None, blocked or "I suggested an action that isn't available here, so nothing was changed."
    return cmd, None


# ---------------------------------------------------------------- words lane: a turn
def context(sess, message, chips):
    v = sess.views.get(sess.current)
    history = [{"role": "user" if t.role == "user" else "assistant", "content": t.text} for t in sess.turns if t.text][-12:]
    return Context(message=message, chips=chips, path=v.path if v else "chat", phase=sess.phase,
                   scan=scan_state(engine, v.scan) if v and v.scan else None, selected=v.sel if v else None, history=history)


async def run_assistant(sess, shell, events, asked):
    """Consume the assistant's stream into one turn: text as it comes (never held for the view), the composing frame when
    a view starts, the view when it is valid, command cards. Returns True when the view changed."""
    changed, deadline = False, None
    async for kind, payload in events:
        if kind == "text":
            shell.text, shell.status = (shell.text + " " + payload).strip(), None
            await push(sess, oob_turn_slot(sess, shell, "text"))
        elif kind == "view_start":
            shell.composing, deadline = True, time.monotonic() + VIEW_DEADLINE_S
            r = renderer(sess)
            await push(sess, oob_turn_slot(sess, shell, "view") if r.layout_of(r.view) == "inline"
                       else oob("wb-stage", r.render("frames/composing_stage.html.j2")))
        elif kind == "view":
            shell.composing = False
            cur = sess.views.get(sess.current)
            checked = cat.check_view(payload, sess.phase, resolve, current_path=cur.path if cur else "chat")
            for d in checked.dropped:
                track("view.drop", code=d.code, type=d.type)
            late = deadline is not None and time.monotonic() > deadline
            if not late and checked.spec and (checked.components or (checked.spec["path"] == "chat" and not payload.get("components"))):
                v, prev = new_view(sess, checked.spec, tid=shell.id, origin="assistant", asked=asked, dropped=checked.dropped)
                shell.view_id, changed = v.id, True
                await push(sess, show_view(sess, v, prev))
            else:                                            # quiet fallback: words only, never red
                shell.note = "No view this time; the answer is in words."
                track("view.deadline" if late else "view.fallback", reason=checked.rejected or checked.codes)
                html = oob_turn_slot(sess, shell, "text") + oob_turn_slot(sess, shell, "view")
                if cur and renderer(sess).layout_of(cur) != "inline":   # put the stage back as it was
                    html += str(renderer(sess).layout_html(oob=True))   # str(): Markup + str would escape the str
                await push(sess, html)
        elif kind == "command":
            cmd, refusal = propose(payload, "assistant")
            if cmd:
                shell.commands.append(cmd.id)             # tool_result to the model: "proposed k001, waiting for the person"
                await push(sess, oob_turn_slot(sess, shell, "cmds"))
            else:
                shell.note = refusal
                await push(sess, oob_turn_slot(sess, shell, "text"))
    return changed


async def turn_endpoint(request):
    """POST a message (+ context chips). The turn arrives over the stream; this response only carries HX-Push-Url when
    the model changed the path (so Back works), once the model is done or the turn deadline passed."""
    sess = session(request)
    if not csrf_ok(request, sess):
        return Response("CSRF", status_code=403)
    form = await request.form()
    text = (form.get("text") or "").strip()[:2000]
    if not text:
        return Response(status_code=204)
    chips = []
    for raw in form.getlist("ctx")[:3]:                       # structured context, validated like any input
        try:
            ch = json.loads(raw)
            if ch.get("kind") == "page" and fx.find_page(ch["route"], ch.get("state")):
                chips.append({k: ch.get(k) for k in ("kind", "scan", "route", "state", "label")})
        except (ValueError, KeyError, TypeError, AttributeError):
            continue
    if chips:
        track("ask.pointed", chips=len(chips))
    path_before = sess.views[sess.current].path if sess.current else "chat"
    user = append_turn(sess, "user", text=text, chips=chips)
    shell = append_turn(sess, "assistant")
    await push(sess, oob_turns(sess, [user, shell]))
    started = asyncio.Event()

    async def events():
        async for e in assistant.stream(context(sess, text, chips)):
            started.set()
            yield e

    async def still_working():
        await asyncio.sleep(STILL_WORKING_S)
        if not started.is_set():
            shell.status = "Still working"
            await push(sess, oob_turn_slot(sess, shell, "text"))

    watchdog = asyncio.create_task(still_working())
    changed = False
    try:
        changed = await asyncio.wait_for(run_assistant(sess, shell, events(), asked=text), TURN_DEADLINE_S)
    except Exception as e:                                    # model down or too slow: say so; the data lane keeps going
        shell.text, shell.status, shell.composing = "Assistant unavailable — the live map still updates. Try again in a moment.", None, False
        track("assistant.error", error=repr(e))
        await push(sess, oob_turn_slot(sess, shell, "text") + oob_turn_slot(sess, shell, "view"))
    finally:
        watchdog.cancel()
    v = sess.views.get(sess.current)
    headers = {"HX-Push-Url": renderer(sess).url(v)} if changed and v and v.path != path_before else {}
    return Response(status_code=200, headers=headers)


# ---------------------------------------------------------------- data lane: the stream
ANNOUNCE_EVENT = {"scan.started": lambda e: f"Scan {fx.short_id(e.scan)} started",
                  "scan.resumed": lambda e: f"Resumed as scan {fx.short_id(e.scan)}",
                  "scan.stopped": lambda e: f"Scan stopped at {e.data.get('route')}, step {e.step}"}


def update_html(sess, view, ev):
    """One data-lane message: out-of-band swaps for every live region of the current view bound to the event's scan."""
    r = renderer(sess)
    slots, layout = r.slots(view)
    parts = [r.live_parts(view, c, place) for place, comps in slots.items() for c in comps if c["bind"].get("scan") == ev.scan]
    if layout == "inline" and any(c["type"] == "LiveMap" for c in slots["card"]):
        parts.append(oob("wb-livebar", r.livebar(view)))
    if ev.type in ANNOUNCE_EVENT:
        parts.append(oob("wb-announce", ANNOUNCE_EVENT[ev.type](ev)))
    if ev.data.get("at"):
        parts.append(f'<span id="wb-last-at" hx-swap-oob="innerHTML">{ev.data["at"]}</span>')
    return "".join(parts)


def parse_cursor(raw, sess):
    """Message ids are '<outbox entries delivered>|<last data event>' so one id resumes both lanes."""
    try:
        out, ev = (raw or "").split("|", 1)
        return max(0, min(int(out), len(sess.outbox))), ev or None
    except ValueError:
        return len(sess.outbox), None


async def stream(request):
    """One SSE stream per conversation (`?c=`), on an element outside the swapped layout."""
    sess = SESSIONS.get(request.query_params.get("c", ""))
    if not sess or request.cookies.get("wb_sid") != sess.id:
        return Response(status_code=403)
    if engine.dropping():
        return Response(status_code=503)                     # EventSource gives up → the htmx extension retries with backoff
    out_i, cursor = parse_cursor(request.headers.get("last-event-id") or request.query_params.get("last_event_id"), sess)
    track("stream.open", outbox=out_i, cursor=cursor)

    async def gen():
        nonlocal out_i, cursor
        vid, gen_id = None, None
        yield "retry: 1500\n\n"
        while True:
            while out_i < len(sess.outbox):                  # words lane and view changes first: layout before data
                out_i += 1
                yield sse(sess.outbox[out_i - 1], event="frag", id=f"{out_i}|{cursor or ''}")
            v = sess.views.get(sess.current)
            if v and v.id != vid:                            # a new view: its markup already shows the state at v.after
                if vid is not None or (cursor and not cursor.startswith(f"{v.scan}#")):
                    cursor = v.after
                vid, gen_id = v.id, engine.generation(v.scan)
            if v and v.scan:
                if engine.generation(v.scan) != gen_id:      # the scan was restarted: start over
                    cursor, gen_id = None, engine.generation(v.scan)
                for ev in engine.events(v.scan, cursor):
                    cursor = ev.id
                    yield sse(update_html(sess, v, ev), event="frag", id=f"{out_i}|{cursor}")
            if engine.dropping() or await request.is_disconnected():
                break
            async with engine.cond:
                idle = out_i >= len(sess.outbox) and not (v and v.scan and engine.events(v.scan, cursor))
                if idle and not engine.dropping() and sess.views.get(sess.current) is v:
                    try:
                        await asyncio.wait_for(engine.cond.wait(), HEARTBEAT_S)
                    except asyncio.TimeoutError:
                        yield sse("ok", event="heartbeat")

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


async def refresh(scan, announce=None):
    """Push the live regions of every current view bound to `scan` (narration and attempts change outside the step log)."""
    for sess in list(SESSIONS.values()):
        v = sess.views.get(sess.current)
        if not v or v.scan != scan:
            continue
        r = renderer(sess)
        slots, _ = r.slots(v)
        html = "".join(r.live_parts(v, c, place) for place, comps in slots.items() for c in comps if c["bind"].get("scan") == scan)
        await push(sess, html + (oob("wb-announce", announce) if announce else ""))


async def on_event(ev):
    """Hooks on the data lane: narration (words lane, async), attempts, and a stop that may recompose the screen."""
    if ev.type in ("page.visited", "scan.stopped"):
        await narrate(ev)
    if ev.type == "attempt.result":
        await refresh(ev.scan, announce=f"Attempt {ev.data['n']} {ev.data['result']}")
    if ev.type == "scan.stopped" and ev.data.get("error"):
        for sess in list(SESSIONS.values()):
            v = sess.views.get(sess.current)
            if v and v.scan == ev.scan:
                await system_event(sess, {"type": "scan.stopped", "scan": ev.scan, "step": ev.step, "data": ev.data})


async def system_event(sess, event, text=None):
    """A system event becomes a new turn: an optional Workbench line, then the assistant's reaction (may render a view)."""
    if text:
        await push(sess, oob_turns(sess, [append_turn(sess, "system", text=text)]))
    try:
        reply = await assistant.on_event(context(sess, "", []), event)
    except Exception as e:
        track("assistant.error", error=repr(e))
        return
    if not reply:
        return
    shell = append_turn(sess, "assistant")
    await push(sess, oob_turns(sess, [shell]))

    async def parts():
        if reply.text:
            yield ("text", reply.text)
        if reply.spec is not None:
            yield ("view_start", None)
            yield ("view", reply.spec)
        if reply.command:
            yield ("command", reply.command)
    await run_assistant(sess, shell, parts(), asked=None)


async def narrate(ev):
    """Ask for narration, check it (schema + numbers against cited events), fall back to a templated line."""
    st = scan_state(engine, ev.scan)
    refs = {e.ref: e.data for e in st["events"]}
    lines, source = [], "assistant"
    try:
        raw = await assistant.narrate(ev.scan, [{"step": ev.step, "type": ev.type, "data": ev.data}])
    except Exception as e:
        raw = None
        track("narration.error", error=repr(e))
    if raw:
        lines, rejected = cat.check_narration(raw, refs)
        for line, why in rejected:
            track("narration.rejected", line=line, reason=why)
    if not lines:
        source, d = "template", ev.data
        text = f"Opened {d['route']} · {d['title']}." if ev.type == "page.visited" else f"Stopped at {d.get('route')}: {d.get('reason')}"
        lines = [{"text": text, "cites": [ev.ref], "kind": "stop" if ev.type == "scan.stopped" else "visit"}]
    engine.narration.setdefault(ev.scan, []).extend(dict(ln, source=source) for ln in lines)
    await refresh(ev.scan)


engine.hooks.append(on_event)


# ---------------------------------------------------------------- commands
async def command_changed(cmd):
    """A command settled: update its card, then the outcome arrives as a new turn (which may bring a view)."""
    track("command." + cmd.state, command=cmd.name, source=cmd.source, error=cmd.error)
    card = env.get_template("frames/cmd.html.j2").render(cmd=cmd, oob=True)
    for sess in list(SESSIONS.values()):
        if not any(cmd.id in t.commands for t in sess.turns):
            continue
        await push(sess, card)
        if cmd.state != "done":
            continue
        r = cmd.result
        if cmd.name == "scan.resume":                         # mechanical: follow the continuation, no model call
            await switch_path(sess, "mapping", r["scan"], path_source="assistant",
                              text=f"Resumed as scan {fx.short_id(r['scan'])}. It continues {fx.short_id(r['continues'])} from the last good checkpoint.",
                              why=f"Following scan {fx.short_id(r['scan'])}, which continues {fx.short_id(r['continues'])}.")
        elif cmd.name == "path.attempt":
            await system_event(sess, {"type": "attempt.result", "scan": cmd.args["scan"], "step": cmd.args["step"], "data": r},
                               text=f"Attempt {r['n']} {r['result']}: {r['note']}")
        else:
            await system_event(sess, {"type": "command.done", "data": {"command": cmd.name, "result": r}},
                               text=cmd.result_text)


commands = Commands(engine, on_change=command_changed)


async def propose_endpoint(request):
    """A button proposes a command (Stop, Resume, Run attempt, Skip next time). The card asks before anything runs."""
    sess = session(request)
    if not csrf_ok(request, sess):
        return Response("CSRF", status_code=403)
    f = await request.form()
    name = f.get("command")
    args = {"scan.stop": lambda: {"scan": f.get("scan")}, "scan.resume": lambda: {"scan": f.get("scan")},
            "path.attempt": lambda: {"scan": f.get("scan"), "step": int(f.get("step") or 0), "variation": f.get("variation")},
            "mark.add": lambda: {"target": {"route": f.get("route")}, "kind": f.get("kind")}}.get(name, lambda: {})()
    reason = {"scan.stop": "You pressed Stop the scan.", "scan.resume": "You pressed Resume.",
              "path.attempt": "You chose this variation for the next attempt.", "mark.add": "You pressed Skip next time."}
    cmd, refusal = propose({"command": name, "args": args, "reason": reason.get(name, "You pressed the button.")}, "you")
    turn = append_turn(sess, "system", text="Confirm to run this." if cmd else refusal, commands=[cmd.id] if cmd else [])
    await push(sess, oob_turns(sess, [turn]))
    return Response(status_code=204)


async def command_action(request):
    sess = session(request)
    if not csrf_ok(request, sess):
        return Response("CSRF", status_code=403)
    cid, action = request.path_params["cid"], request.path_params["action"]
    if cid not in commands.items or action not in ("confirm", "cancel", "undo"):
        return Response(status_code=404)
    if action == "confirm":
        try:
            cmd = await commands.confirm(cid, (await request.form()).get("token"), writable=sess.as_of == "now")
        except PermissionError:
            return Response("token", status_code=403)
        track("command.confirmed", command=cmd.name)
    elif action == "cancel":
        cmd = commands.cancel(cid)
        track("command.cancelled", command=cmd.name)
    else:
        cmd = await commands.undo(cid)
        track("command.undone", command=cmd.name)
    await push(sess, env.get_template("frames/cmd.html.j2").render(cmd=cmd, oob=True))
    return Response(status_code=204)


# ---------------------------------------------------------------- pages and small routes
async def workbench(request):
    sess = session(request, create=True)
    q = request.query_params
    if q.get("phase") in ("1", "2", "3"):
        sess.phase = int(q["phase"])
    if "focus" in q:
        sess.focus = q["focus"] == "1"
    if "as_of" in q:
        sess.as_of = q["as_of"] if q["as_of"] in ("now", "release:9c21", "scan:01a12f40-8c1e-7000-a2d9-4b7f1e6c3a05") else "now"
    cur = sess.views.get(sess.current)
    path = q.get("path")
    if path in cat.paths_for(sess.phase):
        scan_id = q.get("scan") if resolve("scan", q.get("scan")) else (cur.scan if cur else None)
        if not cur or cur.path != path or (scan_id and cur.scan != scan_id):
            if cur and cur.path != path:
                track("path.override", frm=cur.path, to=path)
            await switch_path(sess, path, scan_id, sel=q.get("sel"))
        elif q.get("sel"):
            cur.sel = q["sel"]
    elif cur and cur.path not in cat.paths_for(sess.phase):          # the phase went down: back to chat
        await switch_path(sess, "chat", None)
    if is_hx(request):                                                # the change itself arrives over the stream
        return Response(status_code=200, headers={"HX-Push-Url": renderer(sess).url(sess.views[sess.current])})
    resp = HTMLResponse(renderer(sess).page(as_of=sess.as_of))
    resp.set_cookie("wb_sid", sess.id, httponly=True, samesite="lax")
    return resp


async def select(request):
    """A page was clicked: the selection changes, the layout is swapped (log and composer preserved), the URL replaced."""
    sess = session(request)
    q = request.query_params
    v = sess.views.get(q.get("view")) if sess else None
    if not v or v.id != sess.current:
        return Response(status_code=204)                      # a folded (older) view: nothing to update
    v.sel = q.get("sel")
    r = renderer(sess)
    if r.layout_of(v) == "inline":
        v.sheet_by, sess.sheet_open = "you", True             # the person opened the sheet: not generated
    for c in v.spec["components"]:
        if c["type"] == "LiveMap":
            c["props"]["follow"] = False                      # selecting a page stops following the crawler
    slots, _ = r.slots(v)
    cards = "".join(r.live_parts(v, c, "card") for c in slots["card"] if "scan" in c["bind"])
    await push(sess, str(r.layout_html(oob=True)) + cards)
    return Response(status_code=200, headers={"HX-Replace-Url": r.url(v)})   # 200: htmx ignores history headers on 204


async def sheet(request):
    sess = session(request)
    if not csrf_ok(request, sess):
        return Response("CSRF", status_code=403)
    sess.sheet_open = (await request.form()).get("open") == "1"
    await push(sess, renderer(sess).layout_html(oob=True))
    return Response(status_code=204)


async def feedback(request):
    sess = session(request)
    if not csrf_ok(request, sess):
        return Response("CSRF", status_code=403)
    f = await request.form()
    value, reason = f.get("value"), f.get("reason")
    track("feedback", view=f.get("view"), cid=f.get("cid"), value=value, reason=reason)
    return HTMLResponse(renderer(sess).feedback(f.get("view"), f.get("cid"), value=value, reason=reason))


async def event_page(request):
    scan, step = request.path_params["scan"], int(request.path_params["step"])
    evs = [e for e in engine.logs.get(scan, []) if e.step == step]
    body = json.dumps([{"id": e.id, "type": e.type, "data": e.data} for e in evs], ensure_ascii=False, indent=2)
    return HTMLResponse(env.get_template("event.html.j2").render(ref=f"{scan}#{step}", body=body))


async def demo_reset(request):
    sess = session(request)
    if not csrf_ok(request, sess):
        return Response("CSRF", status_code=403)
    engine.reset()
    SESSIONS.pop(sess.id, None)
    return Response(status_code=204, headers={"HX-Redirect": "/workbench"})


async def demo_drop(request):
    sess = session(request)
    if not csrf_ok(request, sess):
        return Response("CSRF", status_code=403)
    engine.drop_until = time.monotonic() + 5
    await engine.notify()
    track("demo.drop_stream")
    return Response(status_code=204)


async def telemetry(request):
    return JSONResponse(TELEMETRY[-200:])


routes = [
    Route("/", lambda r: RedirectResponse("/workbench")),
    Route("/workbench", workbench),
    Route("/workbench/turn", turn_endpoint, methods=["POST"]),
    Route("/workbench/stream", stream),
    Route("/workbench/select", select),
    Route("/workbench/sheet", sheet, methods=["POST"]),
    Route("/workbench/feedback", feedback, methods=["POST"]),
    Route("/workbench/commands/propose", propose_endpoint, methods=["POST"]),
    Route("/workbench/commands/{cid}/{action}", command_action, methods=["POST"]),
    Route("/workbench/events/{scan}/{step:int}", event_page),
    Route("/workbench/telemetry", telemetry),
    Route("/demo/reset", demo_reset, methods=["POST"]),
    Route("/demo/drop", demo_drop, methods=["POST"]),
    Mount("/static", StaticFiles(directory=HERE / "static"), name="static"),
    Mount("/design-system", StaticFiles(directory=PKG / "design-system"), name="ds"),   # one source for CSS + fonts
    Mount("/screens", StaticFiles(directory=PKG / "screens"), name="screens"),         # links to the 2.0 designs
    Mount("/brand", StaticFiles(directory=PKG / "brand"), name="brand"),
]
app = Starlette(routes=routes)
