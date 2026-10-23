"""Writes: every change goes through a command, and every command asks first.

Life cycle (data-cmd-state on .sy-cmd):  proposed ─Confirm→ running → done | failed
                                          proposed ─Cancel→ cancelled · proposed ─10 min→ expired
                                          done ─Undo→ undone (mark.add only)
- The assistant (or a button) can only PROPOSE. Confirm needs the one-time token that was rendered into the card,
  so only the person's click can run it.
- Confirm is idempotent: a second Confirm (double click, retry) returns the current state and runs nothing.
- Writes are refused while the Workbench is not on "Now" (As of).
"""
import asyncio
import os
import secrets
import time
from dataclasses import dataclass, field

import fixture as fx
from catalogue import COMMANDS, check_command

DEMO_DELAY = float(os.environ.get("WB_COMMAND_DELAY", "0.8"))     # makes "running" visible in the demo
EXPIRY_S = 600                                                     # a proposal nobody confirmed expires after 10 min

CONFIRM_LABEL = {"scan.start": "Start scan", "scan.resume": "Resume", "scan.stop": "Stop scan",
                 "path.attempt": "Run attempt", "mark.add": "Add mark"}
VARIATION = {c["variation"]: c["label"] for c in fx.FIX_CHOICES}


@dataclass
class Command:
    id: str
    name: str
    args: dict
    reason: str
    source: str                       # "assistant" | "you"
    token: str = field(default_factory=lambda: secrets.token_urlsafe(16))
    state: str = "proposed"
    result: dict | None = None
    error: str | None = None
    created: float = field(default_factory=time.time)

    @property
    def meta(self):
        return COMMANDS[self.name]

    @property
    def label(self):
        if self.name == "path.attempt":
            return f"Run an attempt: {VARIATION[self.args['variation']]}"
        return self.meta["label"]

    @property
    def effects(self):
        a = dict(self.args, variation=VARIATION.get(self.args.get("variation"), ""))
        return self.meta["effects"].format(**{k: a.get(k, "") for k in ("scan", "step", "variation", "portal")})

    @property
    def undoable(self):
        return bool(self.meta["undo"])

    @property
    def display_args(self):
        """Args in words for the card: labels instead of enum values."""
        nice = {"type": {"full_map": "Full map", "continue_frontier": "Continue the queue", "focused": "Focused"},
                "kind": {"skip": "Skip", "start_here": "Start here", "focus": "Focus", "probe": "Probe",
                         "retry": "Retry", "recheck": "Recheck"}, "variation": VARIATION}
        out = []
        for k, v in self.args.items():
            v = v["route"] if isinstance(v, dict) else nice.get(k, {}).get(v, v)
            out.append((k.replace("_", " ").capitalize(), v))
        return out

    @property
    def confirm_label(self):
        return CONFIRM_LABEL[self.name]

    @property
    def result_text(self):
        r = self.result or {}
        return {"scan.start": lambda: f"Scan {r.get('scan')} started.",
                "scan.resume": lambda: f"Scan {fx.short_id(r.get('scan'))} continues {fx.short_id(r.get('continues'))}.",
                "scan.stop": lambda: "Scan stopped. Recorded pages and the queue are kept.",
                "path.attempt": lambda: f"Attempt {r.get('n')} {r.get('result')}: {r.get('note')}",
                "mark.add": lambda: f"Mark {r.get('id')} added to the next scan plan."}[self.name]()


class Commands:
    def __init__(self, engine, on_change=None):
        self.engine = engine
        self.items: dict[str, Command] = {}
        self.on_change = on_change            # async callable(cmd) for telemetry

    def propose(self, raw, source="assistant"):
        """Validate a proposal. Returns (Command, None) or (None, reason)."""
        cmd, reason = check_command(raw)
        if not cmd:
            return None, reason
        c = Command(id=f"k{len(self.items) + 1:03d}", name=cmd["command"], args=cmd["args"], reason=cmd["reason"], source=source)
        self.items[c.id] = c
        return c, None

    def expire(self, c):
        if c.state == "proposed" and time.time() - c.created > EXPIRY_S:
            c.state = "expired"
        return c

    async def confirm(self, cid, token, writable=True):
        c = self.expire(self.items[cid])
        if c.state != "proposed":
            return c                                     # idempotent (and an expired card runs nothing)
        if not secrets.compare_digest(token or "", c.token):
            raise PermissionError("confirm token does not match")
        if not writable:
            c.state, c.error = "failed", "Writes are off while As of isn't Now."
            return c
        c.state = "running"
        asyncio.create_task(self._run(c))
        return c

    async def _run(self, c):
        await asyncio.sleep(DEMO_DELAY)
        try:
            c.result = await self._execute(c)
            c.state = "done"
        except Exception as e:                           # the card shows the failure; nothing is retried silently
            c.state, c.error = "failed", str(e)
        if self.on_change:
            await self.on_change(c)

    async def _execute(self, c):
        e, a = self.engine, c.args
        if c.name == "scan.start":
            return await e.start_scan(a)
        if c.name == "scan.resume":
            return await e.resume(a["scan"])
        if c.name == "scan.stop":
            return await e.stop(a["scan"])
        if c.name == "path.attempt":
            return await e.attempt(a["scan"], a["step"], a["variation"])
        if c.name == "mark.add":
            return e.add_mark(a["target"], a["kind"])
        raise ValueError(f"no executor for {c.name}")

    def cancel(self, cid):
        c = self.items[cid]
        if c.state == "proposed":
            c.state = "cancelled"
        return c

    async def undo(self, cid):
        c = self.items[cid]
        if c.state == "done" and c.undoable and c.name == "mark.add":
            self.engine.remove_mark(c.result["id"])
            c.state = "undone"
        return c
