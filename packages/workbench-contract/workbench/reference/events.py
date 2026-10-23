"""Data lane: scan events, the stub scan engine, and SSE formatting.

Production: the scan engine writes events to a durable log (a table or a stream such as Redis Streams / NATS);
the web app tails it. Here everything is in memory and a replay task plays the fixture scan.

- One event per step; its ref is `scan#step` (e.g. `01a110d5-2028-…#171`, shown as `01a110d5-2028#171`). Narration lines cite these refs.
- Types: scan.started · scan.resumed (first event of a continuation) · page.visited · action · scan.stopped.
- Attempts are their own runs: attempt.started / attempt.result go to the hooks, not into the scan's step log.
- Narration is words-lane output; it lives in `narration`, next to the log, never in it.
"""
import asyncio
import os
import time
from dataclasses import dataclass, field

import fixture as fx


@dataclass
class Event:
    id: str
    scan: str
    step: int
    type: str
    data: dict

    @property
    def ref(self):
        return f"{self.scan}#{self.step}"


@dataclass
class Engine:
    """Stub scan engine + in-memory event log. One instance per process."""
    interval: float = float(os.environ.get("WB_REPLAY_INTERVAL", "2.5"))   # seconds between replayed events
    logs: dict = field(default_factory=dict)        # scan id -> [Event], one per step
    narration: dict = field(default_factory=dict)   # scan id -> [line]  (words lane, checked)
    attempts: dict = field(default_factory=dict)    # (scan, step) -> [attempt]
    continued: dict = field(default_factory=dict)   # scan id -> the scan that continues it
    marks: list = field(default_factory=list)
    hooks: list = field(default_factory=list)       # async callables(event) run after each event
    gens: dict = field(default_factory=dict)        # scan id -> restart counter (a restarted replay reuses ids)
    drop_until: float = 0.0                         # demo: refuse streams until this time
    _tasks: dict = field(default_factory=dict)
    _cond: asyncio.Condition | None = None

    # -- publishing ---------------------------------------------------------
    @property
    def cond(self):
        if self._cond is None:
            self._cond = asyncio.Condition()
        return self._cond

    async def notify(self):
        async with self.cond:
            self.cond.notify_all()

    async def publish(self, scan, step, type_, data):
        ev = Event(id=f"{scan}#{step}", scan=scan, step=step, type=type_, data=data)
        self.logs.setdefault(scan, []).append(ev)
        await self.notify()
        self._run_hooks(ev)
        return ev

    def _run_hooks(self, ev):
        for hook in self.hooks:
            asyncio.create_task(hook(ev))   # hooks (narration, milestones) never block the data lane

    def events(self, scan, after=None):
        """Events of a scan after the given event id (all when None or unknown)."""
        log = self.logs.get(scan, [])
        if after:
            for i, ev in enumerate(log):
                if ev.id == after:
                    return log[i + 1:]
        return list(log)

    def last_id(self, scan):
        log = self.logs.get(scan)
        return log[-1].id if log else None

    def generation(self, scan):
        return self.gens.get(scan, 0)

    def dropping(self):
        return time.monotonic() < self.drop_until

    # -- replay -------------------------------------------------------------
    def start(self, scan, script):
        """Start replaying a script of (step, type, data) as live events."""
        self.cancel(scan)
        self.logs[scan], self.narration[scan] = [], []
        self.continued.pop(scan, None)
        self.attempts = {k: v for k, v in self.attempts.items() if k[0] != scan}
        self.gens[scan] = self.gens.get(scan, 0) + 1
        self._tasks[scan] = asyncio.create_task(self._run(scan, script))

    async def _run(self, scan, script):
        for step, type_, data in script:
            await asyncio.sleep(self.interval)
            await self.publish(scan, step, type_, data)

    def cancel(self, scan):
        task = self._tasks.pop(scan, None)
        if task:
            task.cancel()

    def reset(self):
        for scan in list(self._tasks):
            self.cancel(scan)
        self.logs.clear()
        self.narration.clear()
        self.attempts.clear()
        self.continued.clear()
        self.marks.clear()
        self.gens = {k: v + 1 for k, v in self.gens.items()}

    # -- what the commands call (commands.py) -------------------------------
    async def start_scan(self, args):
        self.start(fx.SCAN, fx.replay_script())          # the stub engine always replays 01a110d5-2028
        return {"scan": fx.SCAN}

    async def resume(self, scan):
        new = fx.RESUMED_SCAN
        self.continued[scan] = new
        self.start(new, fx.resumed_script())
        return {"scan": new, "continues": scan}

    async def stop(self, scan):
        self.cancel(scan)
        st = scan_state(self, scan)
        await self.publish(scan, st["steps"] + 1, "scan.stopped",
                           dict(k=None, route=st["cur"], at=time.strftime("%H:%M:%SZ", time.gmtime()), steps=st["steps"] + 1,
                                pages=st["pages"], queued=st["queued"], error=None, reason="Stopped by you."))
        return {"scan": scan}

    async def attempt(self, scan, step, variation):
        items = self.attempts.setdefault((scan, step), [])
        n = len(items) + 2                                # attempt 1 is the original failure
        self._run_hooks(Event(f"{scan}#{step}/a{n}", scan, step, "attempt.started", {"n": n, "variation": variation}))
        result, note = fx.ATTEMPT_OUTCOME[variation]
        att = dict(n=n, variation=variation, result=result, note=note,
                   at=fx.ATTEMPT_AT.get(n) or time.strftime("%H:%M:%SZ", time.gmtime()))
        items.append(att)
        await self.notify()
        self._run_hooks(Event(f"{scan}#{step}/a{n}", scan, step, "attempt.result", att))
        return att

    def add_mark(self, target, kind):
        mark = dict(id=f"MK-{len(self.marks) + 1:03d}", target=target, kind=kind)
        self.marks.append(mark)
        return mark

    def remove_mark(self, mark_id):
        self.marks = [m for m in self.marks if m["id"] != mark_id]


def scan_state(engine, scan):
    """Fold a scan's events into the state the components show. Pure function of the log."""
    st = dict(id=scan, status="waiting", steps=0, pages=0, queued=0, cur=None, visits=[], error=None, reason=None,
              stop_step=None, stop_at=None, at=None, last_id=None, continues=None, limit=fx.LIMIT_STEPS,
              continued_by=engine.continued.get(scan), narration=engine.narration.get(scan, []), events=[])
    for ev in engine.logs.get(scan, []):
        d = ev.data
        if ev.type == "scan.started":
            st["status"] = "running"
        elif ev.type == "scan.resumed":                   # a continuation replays to the checkpoint: it starts with those pages
            st["status"], st["continues"] = "running", d["continues"]
            st["visits"] = [dict(_visit(p), status="ok") for p in fx.PAGES[:5]]
            st.update(steps=d["checkpoint_step"], pages=d["carried_pages"], queued=d["carried_queued"], cur=d["start"])
        elif ev.type == "page.visited":
            page = fx.PAGES[d["k"] - 1]
            st["visits"] = [v for v in st["visits"] if v["k"] != d["k"]] + [dict(_visit(page), at=d["at"])]
        if ev.type in ("page.visited", "action", "scan.stopped"):
            st.update(steps=d.get("steps", st["steps"]), pages=d.get("pages", st["pages"]),
                      queued=d.get("queued", st["queued"]), cur=d.get("route") or st["cur"])
        if ev.type == "scan.stopped":
            st.update(status="stopped", error=d.get("error"), reason=d.get("reason"), stop_step=ev.step, stop_at=d.get("at"))
        st["events"].append(ev)
        st["at"], st["last_id"] = d.get("at", st["at"]), ev.id
    for v in st["visits"]:
        v["status"] = "ok"
    if st["visits"]:
        last = st["visits"][-1]
        if st["status"] == "running":
            last["status"] = "running"                    # the crawler's page (cyan)
        elif st["status"] == "stopped" and st["error"]:
            last["status"] = "failed"                     # the stop reason (red); the scan itself is "Stopped" (ash)
    return st


def _visit(page):
    return dict(k=page["k"], key=fx.page_key(page), route=page["route"], state=page["state"], title=page["title"],
                at=page["at"], what=page["what"], side=page["side"])


def sse(data="", event=None, id=None):
    """Format one server-sent event. Multi-line data becomes several `data:` lines."""
    out = []
    if id:
        out.append(f"id: {id}")
    if event:
        out.append(f"event: {event}")
    for line in (data.splitlines() or [""]):
        out.append(f"data: {line}")
    return "\n".join(out) + "\n\n"
