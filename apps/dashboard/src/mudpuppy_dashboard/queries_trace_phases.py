"""A scan's phases over time, for the Trace tab's phase bar (spec 072 FR-002; designer answer
19/02, D-53): the scan's whole time cut into stretches of one kind of work. Phases are data from
the trace, never invented by the bar:

- work phases from the tools the agent called (`KIND_OF`): Start, Replay, Explore, Fill forms (a
  move that filled a form step), Probe; a step of another kind than both its neighbours, shorter
  than `MIN_STEPS`, joins them, so the bar shows stretches, not every switch;
- **Waiting for you**: a gap between two calls with a handoff (a captcha the scan handed to a
  person);
- **Quiet**: no call for `QUIET_S` seconds or more (cut out of the phase it falls in).

A step is a tool call, numbered in the order the scan made them (as the trace lists them).
Read-only, like every dashboard query.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

#: A gap without a call this long (seconds) is Quiet.
QUIET_S = 60
#: After a handoff, standing still this long (seconds) is Waiting for you (shorter: it moved on).
WAIT_S = 10
#: A work stretch shorter than this, between two of one other kind, joins them.
MIN_STEPS = 3
#: The work each tool is (the designer's phase names); other tools keep the current phase.
KIND_OF = {
    "start_run": "Start",
    "login": "Start",
    "go_to_state": "Replay",
    "navigate": "Explore",
    "act": "Explore",
    "get_next_frontier_item": "Explore",
    "get_known_states": "Explore",
    "probe_form": "Probe",
}
FILL = "Fill forms"
#: Events under a move that mean it filled a form.
FORM_EVENTS = ("form_step", "form_autofill")

Kind = Literal["work", "wait", "quiet"]
State = Literal["done", "running", "failed"]


@dataclass
class Phase:
    name: str
    kind: Kind
    start: datetime
    end: datetime
    first_step: int | None = None
    last_step: int | None = None
    state: State = "done"

    @property
    def steps(self) -> int:
        if self.first_step is None or self.last_step is None:
            return 0
        return self.last_step - self.first_step + 1


@dataclass(frozen=True)
class Call:
    step: int
    name: str
    start: datetime
    end: datetime
    form: bool


@dataclass(frozen=True)
class ScanTime:
    start: datetime
    end: datetime
    running: bool
    failed: bool
    phases: list[Phase]
    steps: int


def _at(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def _calls(conn: sqlite3.Connection, run_id: str) -> list[Call]:
    rows = conn.execute(
        # a form step is an event under the call or under one of its phase spans
        "SELECT s.name, s.started_at, s.ended_at,"
        " EXISTS (SELECT 1 FROM trace_spans c WHERE (c.parent_id = s.id OR c.parent_id IN"
        "   (SELECT id FROM trace_spans WHERE parent_id = s.id AND kind = 'phase'))"
        f"   AND c.name IN ({','.join('?' * len(FORM_EVENTS))})) AS form"
        " FROM trace_spans s JOIN trace_boots b ON b.id = s.boot_id"
        " WHERE s.run_id = ? AND s.kind = 'call' ORDER BY b.started_at, s.seq",
        (*FORM_EVENTS, run_id),
    ).fetchall()
    out = []
    for i, r in enumerate(rows, start=1):
        start = _at(r["started_at"])
        out.append(
            Call(
                i, r["name"], start, _at(r["ended_at"]) if r["ended_at"] else start, bool(r["form"])
            )
        )
    return out


def _handoffs(conn: sqlite3.Connection, run_id: str) -> list[datetime]:
    rows = conn.execute(
        "SELECT started_at FROM trace_spans"
        " WHERE run_id = ? AND kind = 'event' AND name = 'handoff'",
        (run_id,),
    ).fetchall()
    return sorted(_at(r["started_at"]) for r in rows)


def _work(c: Call, current: str | None) -> str:
    if c.name == "act" and c.form:
        return FILL
    return KIND_OF.get(c.name, current or "Explore")


def _gap(prev: Call, nxt: Call, handoffs: list[datetime]) -> Phase | None:
    """A handoff fires inside the move that met the captcha: the gap after it, when the scan
    stood still at least `WAIT_S`, is Waiting for you; any other long gap is Quiet."""
    gap = (nxt.start - prev.end).total_seconds()
    if gap >= WAIT_S and any(prev.start <= h <= nxt.start for h in handoffs):
        return Phase("Waiting for you", "wait", prev.end, nxt.start)
    if gap >= QUIET_S:
        return Phase("Quiet", "quiet", prev.end, nxt.start)
    return None


def _cut(calls: list[Call], handoffs: list[datetime]) -> list[Phase]:
    """Consecutive calls of one work make a phase; a wait or a quiet gap is its own phase."""
    out: list[Phase] = []
    current: Phase | None = None
    for i, c in enumerate(calls):
        gap = _gap(calls[i - 1], c, handoffs) if i else None
        if gap is not None:
            out.append(gap)
            current = None
        name = _work(c, current.name if current else None)
        if current is not None and current.name == name:
            current.end, current.last_step = c.end, c.step
            continue
        if current is not None:
            current.end = max(current.end, c.start)  # a work phase runs to the next one
        current = Phase(name, "work", c.start, c.end, c.step, c.step)
        out.append(current)
    return out


def _smooth(phases: list[Phase]) -> list[Phase]:
    """A short work stretch between two work phases of one other kind joins them."""
    out: list[Phase] = []
    i = 0
    while i < len(phases):
        p = phases[i]
        if (
            out
            and i + 1 < len(phases)
            and p.kind == "work"
            and p.steps < MIN_STEPS
            and out[-1].kind == "work"
            and phases[i + 1].kind == "work"
            and out[-1].name == phases[i + 1].name
        ):
            nxt = phases[i + 1]
            out[-1].end, out[-1].last_step = nxt.end, nxt.last_step
            i += 2
            continue
        out.append(p)
        i += 1
    return out


def scan_time(
    conn: sqlite3.Connection, run_id: str, now: datetime | None = None
) -> ScanTime | None:
    """The scan's phases, or None when it has no traced calls."""
    calls = _calls(conn, run_id)
    run = conn.execute(
        "SELECT status, warning, ended_at FROM runs WHERE id = ?", (run_id,)
    ).fetchone()
    if not calls or run is None:
        return None
    phases = _smooth(_cut(calls, _handoffs(conn, run_id)))
    running = run["status"] == "running"
    end = (
        (now or datetime.now(UTC))
        if running
        else _at(run["ended_at"])
        if run["ended_at"]
        else calls[-1].end
    )
    end = max(end, calls[-1].end)
    last = phases[-1]
    last.end = end
    failed = run["status"] in ("interrupted", "stopped_warning")
    if running:
        last.state = "running"
    elif failed:
        last.state = "failed"
    return ScanTime(calls[0].start, end, running, failed, phases, len(calls))


def axis_ticks(start: datetime, end: datetime) -> list[tuple[float, datetime]]:
    """The axis: the start, round minutes between (at most about eight), the end; in percent."""
    total = (end - start).total_seconds()
    if total <= 0:
        return [(0.0, start)]
    every = next((m for m in (1, 2, 5, 10, 15, 30, 60, 120, 240) if total / 60 / m <= 8), 480)
    tick = start.replace(second=0, microsecond=0) + timedelta(minutes=1)
    while tick.minute % every and every < 60:
        tick += timedelta(minutes=1)
    out = [(0.0, start)]
    while tick < end:
        out.append(((tick - start).total_seconds() * 100 / total, tick))
        tick += timedelta(minutes=every)
    out.append((100.0, end))
    return out
