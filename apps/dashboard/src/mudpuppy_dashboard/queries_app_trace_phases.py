"""The Trace tab's phase bar as typed JSON (spec 072 FR-002; designer answer 19/02) over
`queries_trace_phases`: every phase with its words, its share of the bar and its steps, and the
axis. The bar draws it; it never invents a phase. Read-only."""

from __future__ import annotations

import sqlite3
from datetime import datetime

from pydantic import BaseModel

from .queries_app import StatusOut, status_out
from .queries_trace_phases import Phase, axis_ticks, scan_time


class PhaseOut(BaseModel):
    name: str
    #: work; wait (Waiting for you: the only orange); quiet (no new step for 60 s or more).
    kind: str
    #: done; running (the open end, the last phase of a running scan); failed (a red end cap).
    state: str
    start: str
    end: str
    #: Its length in seconds: its share of the bar.
    seconds: int
    first_step: int | None
    last_step: int | None
    #: "10:49:20Z · 11 s · steps 1–11"
    time_line: str


class TickOut(BaseModel):
    left: float
    label: str


class ScanPhasesOut(BaseModel):
    has_phases: bool
    #: "6 Oct 10:49:20Z – 10:58:44Z · 9 min 24 s · 171 steps"
    summary: str
    status: StatusOut | None
    steps: int
    phases: list[PhaseOut]
    axis: list[TickOut]


NO_PHASES = ScanPhasesOut(has_phases=False, summary="", status=None, steps=0, phases=[], axis=[])


def _clock(t: datetime) -> str:
    return t.strftime("%H:%M:%SZ")


def _length(seconds: float) -> str:
    """'11 s', '9 min 24 s', '2 h 05 min' (the designer's words; minutes are "min")."""
    s = round(seconds)
    if s < 60:
        return f"{s} s"
    minutes, s = divmod(s, 60)
    if minutes < 60:
        return f"{minutes} min {s} s"
    hours, minutes = divmod(minutes, 60)
    return f"{hours} h {minutes:02d} min"


def _tick(left: float, at: datetime, running: bool) -> TickOut:
    """The two ends with seconds (a running scan's end is "now"), round minutes between."""
    if left == 100 and running:
        label = f"now {at.strftime('%H:%MZ')}"
    elif left in (0, 100):
        label = _clock(at)
    else:
        label = at.strftime("%H:%MZ")
    return TickOut(left=round(left, 2), label=label)


def _steps(p: Phase) -> str:
    if p.first_step is None or p.last_step is None:
        return "no steps"
    if p.first_step == p.last_step:
        return f"step {p.first_step}"
    return f"steps {p.first_step}–{p.last_step}"


def _phase(p: Phase) -> PhaseOut:
    seconds = (p.end - p.start).total_seconds()
    return PhaseOut(
        name=p.name,
        kind=p.kind,
        state=p.state,
        start=p.start.isoformat().replace("+00:00", "Z"),
        end=p.end.isoformat().replace("+00:00", "Z"),
        seconds=max(1, round(seconds)),
        first_step=p.first_step,
        last_step=p.last_step,
        time_line=f"{_clock(p.start)} · {_length(seconds)} · {_steps(p)}",
    )


def scan_phases(conn: sqlite3.Connection, scan: str, now: datetime | None = None) -> ScanPhasesOut:
    t = scan_time(conn, scan, now)
    if t is None:
        return NO_PHASES
    run = conn.execute("SELECT status FROM runs WHERE id = ?", (scan,)).fetchone()
    end = f"now {t.end.strftime('%H:%MZ')}" if t.running else _clock(t.end)
    length = _length((t.end - t.start).total_seconds())
    axis = [_tick(left, at, t.running) for left, at in axis_ticks(t.start, t.end)]
    return ScanPhasesOut(
        has_phases=True,
        summary=f"{t.start.strftime('%-d %b')} {_clock(t.start)} – {end} · {length}"
        f" · {t.steps} steps",
        status=status_out("run", run["status"]) if run else None,
        steps=t.steps,
        phases=[_phase(p) for p in t.phases],
        axis=axis,
    )
