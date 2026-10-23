"""The React console's Trace and Process sections of a scan (R-96, spec 056): the trace summary,
one page of tool calls, a call's phases and events, and a trace run's process. Read-only, no SQL
here (G-15)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from .. import queries_app_trace as trace
from .api_common import page_at, scan_store, store
from .deps import web_of

router = APIRouter(prefix="/api")


class TraceQuery(BaseModel):
    """The tools and statuses shown (each repeated), Problems only, the page."""

    env: str | None = None
    tool: list[str] = []
    status: list[str] = []
    problems: bool = False
    cursor: str | None = None


@router.get("/scans/{scan}/trace/summary")
def trace_summary(request: Request, scan: str, env: str | None = None) -> trace.TraceSummaryOut:
    """The trace at a glance: calls, tokens, health, time per phase, slowest calls."""
    with scan_store(request, scan, env) as conn:
        return trace.trace_summary(conn, scan)


@router.get("/scans/{scan}/trace")
def trace_calls(request: Request, scan: str, q: Annotated[TraceQuery, Query()]) -> trace.TraceCalls:
    """One page of the scan's tool calls, with the agent's context for each."""
    f = trace.TraceFilter([t for t in q.tool if t], [s for s in q.status if s], q.problems)
    with scan_store(request, scan, q.env) as conn:
        return trace.trace_calls(conn, scan, f, page_at(request, q.cursor))


@router.get("/spans/{span}/children")
def span_children(request: Request, span: str, env: str | None = None) -> trace.SpanChildren:
    """A call's phases and events, loaded when the call is opened."""
    c = web_of(request).ctx(request, env)
    with store(c) as conn:
        found = trace.span_children(conn, span)
    if found is None:
        raise HTTPException(404, f"There is no call {span} in this store.")
    return found


@router.get("/scans/{scan}/process")
def process(request: Request, scan: str, env: str | None = None) -> trace.ProcessTab:
    """A trace run's process: its facts, its map and its steps."""
    with scan_store(request, scan, env) as conn:
        return trace.process(conn, scan)
