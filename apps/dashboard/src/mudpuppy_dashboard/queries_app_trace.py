"""The React console's Trace and Process sections of a scan (R-96, spec 056): the htmx `/runs/{id}`
tabs `trace` and `process` as typed JSON over `queries`, `queries_docs` and `queries_trace`.
Statuses come mapped, durations written as the htmx page writes them, JSON as text, every event's
detail as facts (`queries_app_trace_events`). Read-only."""

from __future__ import annotations

import sqlite3
from typing import Any, NamedTuple

from pydantic import BaseModel

from . import queries, queries_docs, queries_trace
from .formats import fmt_duration, pretty_json, short_id
from .models import TraceSpan
from .queries_app import StatusOut, status_out
from .queries_app_scan_tabs import EvidenceOut, PageAt, evidence
from .queries_app_screens import Option
from .queries_app_trace_events import EventDetail, event_detail

SPAN_STATUSES = ("running", "ok", "refused", "stopped", "error", "unfinished")


class Named(BaseModel):
    name: str
    count: int


class StatusCount(BaseModel):
    status: StatusOut
    count: int


class PhaseStatOut(BaseModel):
    name: str
    count: int
    sum: str
    p50: str
    p95: str


class SlowCall(BaseModel):
    id: str
    seq: int
    name: str
    duration: str
    status: StatusOut


class TraceSummaryOut(BaseModel):
    has_trace: bool
    calls: int
    by_tool: list[Named]
    by_status: list[StatusCount]
    #: "1200 in / 300 out (40 cache read) · 5 turns", or why there are none.
    tokens: str
    levels: str
    #: Clean, or the trace's gaps in words ("3 dropped · 1 unfinished").
    health: StatusOut
    health_parts: list[str]
    phases: list[PhaseStatOut]
    slowest: list[SlowCall]


NO_TRACE = TraceSummaryOut(
    has_trace=False,
    calls=0,
    by_tool=[],
    by_status=[],
    tokens="",
    levels="",
    health=StatusOut(shape=None, word="—"),
    health_parts=[],
    phases=[],
    slowest=[],
)


def _tokens(sm: Any) -> str:
    t = sm.tokens
    if not t.turns:
        return "No tool-use turns" if sm.agent_imported else "Not imported"
    cache = f" ({t.cache_read_tokens} cache read)" if t.cache_read_tokens else ""
    return f"{t.input_tokens} in / {t.output_tokens} out{cache} · {t.turns} turns"


def _health(sm: Any) -> tuple[StatusOut, list[str]]:
    h = sm.health
    agent = sm.agent_imported
    parts = [
        (h.dropped, "dropped"),
        (h.truncated, "truncated"),
        (h.unfinished, "unfinished"),
        (h.unmatched_agent_calls if agent else 0, "agent calls never reached the server"),
        (h.unmatched_server_calls if agent else 0, "server calls unmatched to the agent"),
    ]
    found = [f"{n} {what}" for n, what in parts if n]
    if not found:
        return StatusOut(shape="ok", word="Clean"), []
    return status_out("span", "error" if h.dropped else "unfinished"), found


def trace_summary(conn: sqlite3.Connection, scan: str) -> TraceSummaryOut:
    sm = queries.trace_summary(conn, scan)
    if sm is None:
        return NO_TRACE
    health, parts = _health(sm)
    modes = f" · Playwright trace: {', '.join(sm.pw_trace_modes)}" if sm.pw_trace_modes else ""
    return TraceSummaryOut(
        has_trace=True,
        calls=sm.calls_total,
        by_tool=[Named(name=t, count=n) for t, n in sm.calls_by_tool.items()],
        by_status=[
            StatusCount(status=status_out("span", s), count=n)
            for s, n in sm.calls_by_status.items()
        ],
        tokens=_tokens(sm),
        levels=", ".join(sm.trace_levels) + modes,
        health=health,
        health_parts=parts,
        phases=[
            PhaseStatOut(
                name=p.name,
                count=p.count,
                sum=fmt_duration(p.sum_ms),
                p50=fmt_duration(p.p50_ms),
                p95=fmt_duration(p.p95_ms),
            )
            for p in sm.phases
        ],
        slowest=[
            SlowCall(
                id=s.id,
                seq=s.seq,
                name=s.name,
                duration=fmt_duration(s.duration_ms),
                status=status_out("span", s.status),
            )
            for s in sm.slowest_calls
        ],
    )


class AgentContext(BaseModel):
    imported: bool
    #: "1200 in / 300 out", or None when no agent turn matches.
    tokens: str | None
    text: str | None


class CallOut(BaseModel):
    id: str
    seq: int
    name: str
    status: StatusOut
    duration: str
    rationale: str | None
    #: Between two calls (the crawler's own work, no tool call): shown muted.
    between_calls: bool
    tool_use_id: str | None
    payload: EvidenceOut | None
    attrs: str
    #: The command that opens the call's Playwright trace; None when none was kept.
    pw_trace: str | None
    agent: AgentContext


class UnmatchedCall(BaseModel):
    tool: str
    at: str
    text: str | None


class TraceFilter(NamedTuple):
    tools: list[str]
    statuses: list[str]
    problems: bool


class TraceCalls(BaseModel):
    filter: dict[str, Any]
    tool_options: list[Option]
    status_options: list[Option]
    items: list[CallOut]
    total: int
    next_cursor: str | None
    #: The agent's calls that never reached the server (on the first page only).
    unmatched: list[UnmatchedCall]


def _agent(ctx: dict[str, Any], tool_use_id: str | None) -> AgentContext:
    found = ctx["by_tool_use_id"].get(tool_use_id) if tool_use_id else None
    usage = found["usage"] if found else None
    tokens = None
    if usage is not None:
        cache = f" ({usage.cache_read_tokens} cache read)" if usage.cache_read_tokens else ""
        tokens = f"{usage.input_tokens or 0} in / {usage.output_tokens or 0} out{cache}"
    return AgentContext(
        imported=ctx["imported"], tokens=tokens, text=found["text"] if found else None
    )


def _call(s: TraceSpan, ctx: dict[str, Any]) -> CallOut:
    return CallOut(
        id=s.id,
        seq=s.seq,
        name=s.name,
        status=status_out("span", s.status),
        duration=fmt_duration(s.duration_ms),
        rationale=s.rationale,
        between_calls=s.between_calls,
        tool_use_id=s.tool_use_id,
        payload=evidence(s.payload_ref),
        attrs=pretty_json(s.attrs_json),
        pw_trace=f"npx playwright show-trace data/{s.pw_trace_path}" if s.pw_trace_path else None,
        agent=_agent(ctx, s.tool_use_id),
    )


def trace_calls(conn: sqlite3.Connection, scan: str, f: TraceFilter, at: PageAt) -> TraceCalls:
    statuses = [s for s in f.statuses if s in SPAN_STATUSES]
    page = queries.trace_calls(
        conn,
        scan,
        tools=f.tools or None,
        statuses=statuses or None,
        problems=f.problems,
        cursor=at.cursor,
        limit=at.limit,
    )
    names = sorted({s.name for s in queries.trace_calls(conn, scan, limit=10_000).items})
    ctx = queries_trace.agent_context_for_run(conn, scan)
    unmatched = [] if at.cursor else ctx["unmatched_agent_calls"]
    return TraceCalls(
        filter={"tool": f.tools, "status": statuses, "problems": f.problems},
        tool_options=[Option(value=n, label=n) for n in names],
        status_options=[Option(value=s, label=status_out("span", s).word) for s in SPAN_STATUSES],
        items=[_call(s, ctx) for s in page.items],
        total=page.total,
        next_cursor=page.next_cursor,
        unmatched=[
            UnmatchedCall(tool=u["turn"].tool_name or "", at=u["turn"].created_at, text=u["text"])
            for u in unmatched
        ],
    )


class EventOut(BaseModel):
    kind: str
    name: str
    summary: str
    detail: EventDetail


class PhaseOut(BaseModel):
    name: str
    status: StatusOut
    duration: str
    #: Its share of the call's phase time, in whole percent.
    share: int
    events: list[EventOut]


class SpanChildren(BaseModel):
    #: The scan the call belongs to (a decision event links its Decisions section).
    scan: str | None
    phases: list[PhaseOut]
    events: list[EventOut]


def _event(e: TraceSpan) -> EventOut:
    return EventOut(
        kind=status_out("span_kind", e.kind).word,
        name=e.name,
        summary=e.summary,
        detail=event_detail(e.name, e.attrs_json),
    )


def span_children(conn: sqlite3.Connection, span: str) -> SpanChildren | None:
    """A call's phases (with their events) and its own events; None for an unknown span."""
    call = queries.get_span(conn, span)
    if call is None:
        return None
    children = queries.span_children(conn, span)
    phases = [c for c in children if c.kind == "phase"]
    total = sum(p.duration_ms or 0 for p in phases)
    return SpanChildren(
        scan=call.run_id,
        phases=[
            PhaseOut(
                name=p.name,
                status=status_out("span", p.status),
                duration=fmt_duration(p.duration_ms),
                share=round((p.duration_ms or 0) * 100 / total) if total else 0,
                events=[_event(e) for e in queries.span_children(conn, p.id, kinds=["event"])],
            )
            for p in phases
        ],
        events=[_event(c) for c in children if c.kind == "event"],
    )


class StepOut(BaseModel):
    id: str
    ord: int
    intent: str
    kind: str
    value: str | None
    action: str | None
    outcomes: list[str]
    confidence: StatusOut
    evidence: EvidenceOut | None


class ProcessOut(BaseModel):
    name: str
    goal: str
    persona: str
    outcome: StatusOut
    observed_result: str | None
    boundary_action: str | None
    followup: str | None
    started_at: str
    ended_at: str | None
    not_observable: str | None


class ProcessTab(BaseModel):
    process: ProcessOut | None
    #: The Mermaid source of the process map; None without steps.
    diagram: str | None
    steps: list[StepOut]


def process(conn: sqlite3.Connection, scan: str) -> ProcessTab:
    found = queries_docs.process_for_run(conn, scan)
    if found is None:
        return ProcessTab(process=None, diagram=None, steps=[])
    p, steps = found
    return ProcessTab(
        process=ProcessOut(
            name=p.name,
            goal=p.goal,
            persona=p.persona_id,
            outcome=status_out("outcome", p.outcome),
            observed_result=p.observed_result,
            boundary_action=queries_docs.action_name(conn, p.boundary_action_id),
            followup=short_id(p.followup_record_id) if p.followup_record_id else None,
            started_at=p.created_at,
            ended_at=p.ended_at,
            not_observable=p.not_observable,
        ),
        diagram=queries_trace.process_run_diagram(conn, found),
        steps=[
            StepOut(
                id=s.id,
                ord=s.ord,
                intent=s.intent,
                kind=s.kind,
                value=s.value,
                action=short_id(s.action_id) if s.action_id else None,
                outcomes=[str(o) for o in s.outcomes_json or []],
                confidence=status_out("confidence", s.confidence),
                evidence=evidence(s.evidence_ref),
            )
            for s in steps
        ],
    )
