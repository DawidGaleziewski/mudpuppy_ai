"""Words lane: the assistant. It returns a reply, maybe a view spec, maybe a command proposal — never HTML.

Two implementations behind one protocol:
- ScriptedAssistant: a keyword router over ../examples. Runs with no API key; the demo and the tests use it.
- AnthropicAssistant: sends ../schema/tools.json to the Messages API and returns the tool inputs.
  Enable with ANTHROPIC_API_KEY=… WB_ASSISTANT=anthropic (model: WB_MODEL). Not exercised in this sandbox.
Whatever comes back is checked by catalogue.py before anything is rendered.

`stream(ctx)` is what the server consumes: ("text", str) · ("view_start",) · ("view", spec) · ("command", proposal).
"view_start" is the moment the model opens a render_view tool_use block: the server shows the composing frame then.
Text is never held back for the view. A proposal gets an immediate tool_result ("proposed …, waiting for the person");
what happens after Confirm comes back as a new turn (on_event), which may render a view.
"""
import asyncio
import copy
import json
import os
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

import fixture as fx

ROOT = Path(__file__).resolve().parent.parent
EXAMPLES = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in (ROOT / "examples" / "valid").glob("*.json")}
BROKEN = json.loads((ROOT / "examples" / "invalid" / "unknown-type.json").read_text(encoding="utf-8"))


@dataclass
class Context:
    message: str
    chips: list = field(default_factory=list)       # [{kind:'page', scan, route, state, label}]
    path: str = "chat"
    phase: int = 2
    scan: dict | None = None                         # folded scan state (events.scan_state) or None
    selected: str | None = None                      # page key
    history: list = field(default_factory=list)      # [{'role','content'}] last turns, plain text


@dataclass
class Reply:
    text: str
    spec: dict | None = None          # None = keep the current view
    command: dict | None = None       # a proposal; the person confirms it in a command card


class Assistant(Protocol):
    def stream(self, ctx: Context): ...                                      # async iterator of (kind, payload)
    async def on_event(self, ctx: Context, event: dict) -> Reply | None: ...  # a system event: command done, scan stopped …
    async def narrate(self, scan: str, events: list) -> dict | None: ...


COMPOSE_DELAY = float(os.environ.get("WB_COMPOSE_DELAY", "0.4"))   # scripted: time between view_start and the view


async def stream_reply(reply_coro, delay=COMPOSE_DELAY):
    """Turn a whole Reply into the event stream a streaming model would produce (text first, then the view)."""
    reply = await reply_coro
    if reply.text:
        yield ("text", reply.text)
    if reply.spec is not None:
        yield ("view_start", None)
        await asyncio.sleep(delay)
        yield ("view", reply.spec)
    if reply.command:
        yield ("command", reply.command)


def rebind(spec, scan_id):
    """Point every scan binding of an example spec at the scan we're on."""
    spec = copy.deepcopy(spec)
    for c in spec.get("components", []):
        if "scan" in c.get("bind", {}):
            c["bind"]["scan"] = scan_id
    return spec


class ScriptedAssistant:
    """Deterministic stand-in for the model. Mirrors what the real prompt asks for."""

    def stream(self, ctx):
        return stream_reply(self.respond(ctx))

    async def respond(self, ctx):
        m = ctx.message.lower().strip()
        scan = ctx.scan["id"] if ctx.scan else fx.SCAN
        stopped = bool(ctx.scan and ctx.scan["status"] == "stopped")
        page = ctx.chips[0] if ctx.chips else None

        # demo switches for the fallbacks
        if m.startswith("demo: assistant down"):
            raise RuntimeError("model unavailable (demo)")
        if m.startswith("demo: invalid view"):
            return Reply("Here's a view I can't actually build.", spec=copy.deepcopy(BROKEN))
        if m.startswith("demo: slow"):                    # nothing for 6 s: the "Still working" line shows at 4 s
            await asyncio.sleep(6)
            return Reply("That took a while. Here's the live map.", spec=rebind(EXAMPLES["mapping-live"], scan))

        # point-and-ask: answers about the page in the chip
        if page and page.get("kind") == "page":
            p = fx.find_page(page["route"], page.get("state"))
            if ("why" in m and "stop" in m) or "troubleshoot" in m:
                return self._troubleshoot(ctx, scan)
            if p and ("what did you do" in m or "here" in m):
                return Reply(f"On {fx.page_label(p)} ({p['title']}): {p['what']}")
            if "skip" in m and p:
                return Reply(f"I'll mark {fx.page_label(p)} to skip in the next scan plan.",
                             command={"command": "mark.add", "args": {"target": {"route": p["route"]}, "kind": "skip"},
                                      "reason": "You asked to skip this page next time."})
            if "next" in m:
                return Reply("It takes the next link from the queue, oldest first, and skips links it has already seen.")
            if "missing" in m:
                return Reply("Nothing obvious: every link on this page is either visited or queued. Forms are only "
                             "submitted with the guest test data.")

        if "where" in m and ctx.scan:
            return Reply(f"The crawler is at {ctx.scan['cur'] or '/'}. The map follows it.")
        if any(w in m for w in ("map ", "map the", "explore ")) or m == "map":
            # No view yet: the map comes in the turn that follows the confirmed start (on_event "command.done").
            return Reply("I'll start a map scan from / as guest on sandbox. Confirm it below; the map opens when it starts, "
                         "and you can click any page to look closer or ask about it.",
                         command={"command": "scan.start", "args": {"type": "full_map", "start": "/", "persona": "guest",
                                                                    "limit_steps": 400},
                                  "reason": "You asked to map the OC/AC calculator and what's around it."})
        if "resume" in m or "continue" in m:
            return Reply("Resuming starts a new scan from the last good checkpoint and keeps the queue.",
                         command={"command": "scan.resume", "args": {"scan": scan},
                                  "reason": "You asked to resume the scan."})
        if "stop" in m and "why" not in m and not stopped:
            return Reply("Stopping keeps everything recorded so far.",
                         command={"command": "scan.stop", "args": {"scan": scan}, "reason": "You asked to stop the scan."})
        if "troubleshoot" in m or ("why" in m and "stop" in m):
            return self._troubleshoot(ctx, scan)
        if "banner" in m or "wynik" in m or "fnd-007" in m:
            return Reply("The banner shows on 6 of 11 visits. The proposed explanation is an A/B test; "
                         "the decision stays in Review.", spec=EXAMPLES["explain"]) if ctx.phase >= 3 else \
                Reply("Explaining changes arrives in phase 3. In the meantime, open the finding in Review.")
        if "br-021" in m or "rule" in m:
            return Reply("Here is BR-021 as a decision table, with its latest tests.", spec=EXAMPLES["explain-rule"]) \
                if ctx.phase >= 3 else Reply("Rules open in the Rules section; decision tables come to the Workbench in phase 3.")
        if "how many processes" in m:
            return Reply("Three are accepted. Two more are proposed and one was rejected; those are in Processes.",
                         spec={"version": "1", "path": "chat", "why": "You asked how many processes are accepted.",
                               "components": [{"id": "procs", "type": "RecordList",
                                               "bind": {"records": ["PROC-001", "PROC-002", "PROC-003"]},
                                               "props": {"title": "Accepted processes"}}]})
        if "process" in m or "oblicz" in m or "look like" in m:
            return Reply("Oblicz składkę OC/AC is accepted and explored thoroughly on 9c21. Its rules are below.",
                         spec=EXAMPLES["chat-records"])
        # Not every message recomposes the screen: spec=None keeps the current view.
        return Reply("I can map a part of the portal, troubleshoot a stopped scan, or explain a change. "
                     "Try “Map the OC/AC calculator”.")

    def _troubleshoot(self, ctx, scan):
        if ctx.phase >= 2:
            return Reply("Here's the step where it stopped, the last events and three things to try. "
                         "Tell me if you know something about this form.", spec=rebind(EXAMPLES["troubleshoot"], scan))
        return Reply("The scan stopped because the next action's element wasn't there after the page settled. "
                     "Resume to retry it with a longer wait.", spec=rebind(EXAMPLES["mapping-stopped"], scan))

    async def on_event(self, ctx, event):
        """System events arrive as a new turn. Only some deserve words or a new view."""
        if event["type"] == "command.done" and event["data"]["command"] == "scan.start":
            return Reply("The scan is running. I'll narrate each page; click any of them to look closer.",
                         spec=rebind(EXAMPLES["mapping-live"], event["data"]["result"]["scan"]))
        if event["type"] == "scan.stopped" and event["data"].get("error"):
            return Reply("The scan stopped at /kontakt. Here's why, and what you can do.",
                         spec=rebind(EXAMPLES["mapping-stopped"], event["scan"]))
        if event["type"] == "attempt.result" and event["data"]["result"] == "passed":
            return Reply("Attempt " + str(event["data"]["n"]) + " passed. Resume the scan from the last checkpoint with it?",
                         command={"command": "scan.resume", "args": {"scan": event["scan"]},
                                  "reason": "The attempt passed, so the scan can go on from /porownanie."})
        return None

    async def narrate(self, scan, events):
        lines = []
        for ev in events:
            if ev["type"] not in ("page.visited", "scan.stopped"):
                continue
            text = fx.NARRATION.get(ev["step"]) if scan == fx.SCAN else None
            if scan == fx.RESUMED_SCAN and ev["step"] == 172:
                text = "Recorded the form on /kontakt without submitting it."
            if text:
                lines.append({"text": text, "cites": [f"{scan}#{ev['step']}"],
                              "kind": "stop" if ev["type"] == "scan.stopped" else "visit"})
        return {"scan": scan, "lines": lines} if lines else None


SYSTEM = """You compose MudPuppy's Workbench. You never write HTML, CSS or numbers about the portal.
Call render_view at most once: pick a path (chat, mapping, troubleshoot, explain) and up to four components from the
catalogue, bound to ids you were given. Leave components empty to answer in plain chat. Writes (start/resume/stop a
scan, attempts, marks) are only ever proposed with propose_command; the person confirms them. Write short, plain
replies. Facts and numbers come from the components, so do not repeat them in prose unless they were given to you."""


class AnthropicAssistant:
    """Adapter for the Anthropic Messages API (tool use). Small on purpose; add retries and streaming in production."""

    def __init__(self, api_key=None, model=None, timeout=20):
        self.key = api_key or os.environ["ANTHROPIC_API_KEY"]
        self.model = model or os.environ.get("WB_MODEL", "claude-sonnet-5-5")
        self.timeout = timeout
        tools = json.loads((ROOT / "schema" / "tools.json").read_text(encoding="utf-8"))
        self.tools = {t["name"]: t for t in tools}

    def _post(self, body):
        req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(),
                                     headers={"x-api-key": self.key, "anthropic-version": "2023-06-01",
                                              "content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.loads(r.read())

    async def _call(self, user, tools, tool_choice, history=()):
        body = {"model": self.model, "max_tokens": 1024, "system": SYSTEM, "tool_choice": tool_choice,
                "tools": [self.tools[t] for t in tools],
                "messages": [*history, {"role": "user", "content": user}]}
        return await asyncio.to_thread(self._post, body)

    @staticmethod
    def _context(ctx):
        facts = {"path": ctx.path, "phase": ctx.phase, "selected": ctx.selected, "pointing_at": ctx.chips}
        if ctx.scan:
            s = ctx.scan
            facts["scan"] = {k: s[k] for k in ("id", "status", "steps", "pages", "queued", "cur", "reason", "stop_step")}
            facts["scan"]["visited"] = [v["key"] for v in s["visits"]]
        facts["records"] = sorted(fx.RECORDS) + sorted(fx.FINDINGS) + sorted(fx.CHANGES)
        return "Context (ids you may bind):\n" + json.dumps(facts, ensure_ascii=False)

    def stream(self, ctx):
        # A production adapter uses the streaming Messages API and yields ("view_start",) on the content_block_start of a
        # render_view tool_use block. This sketch calls once and replays the parts in order (text first).
        return stream_reply(self.respond(ctx), delay=0)

    async def respond(self, ctx):
        res = await self._call(f"{self._context(ctx)}\n\nThe person says: {ctx.message}",
                               ["render_view", "propose_command"], {"type": "auto"}, ctx.history[-6:])
        text, spec, command = [], None, None
        for block in res.get("content", []):
            if block["type"] == "text":
                text.append(block["text"])
            elif block["type"] == "tool_use" and block["name"] == "render_view" and spec is None:
                spec = block["input"]
            elif block["type"] == "tool_use" and block["name"] == "propose_command" and command is None:
                command = block["input"]
        return Reply(" ".join(text).strip() or "Here you go.", spec=spec, command=command)

    async def on_event(self, ctx, event):
        ctx.message = f"[system event] {event['type']}: {json.dumps(event, ensure_ascii=False, default=str)}"
        return await self.respond(ctx)

    async def narrate(self, scan, events):
        payload = [{"ref": f"{scan}#{e['step']}", "type": e["type"], "data": e["data"]} for e in events]
        res = await self._call("Narrate these events:\n" + json.dumps(payload, ensure_ascii=False),
                               ["narrate"], {"type": "tool", "name": "narrate"})
        for block in res.get("content", []):
            if block["type"] == "tool_use":
                return block["input"]
        return None


def make_assistant():
    if os.environ.get("WB_ASSISTANT") == "anthropic" and os.environ.get("ANTHROPIC_API_KEY"):
        return AnthropicAssistant()
    return ScriptedAssistant()
