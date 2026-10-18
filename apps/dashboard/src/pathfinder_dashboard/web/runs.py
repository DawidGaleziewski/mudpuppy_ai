"""Run pages: `/runs/{run_id}` with its tabs, and the live regions they serve (`/fragments/runs/*`,
`/fragments/spans/*`)."""

from __future__ import annotations

import sqlite3
from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from fastapi.responses import HTMLResponse
from starlette.exceptions import HTTPException

from .. import (
    db,
    diagrams,
    map_layout,
    queries,
    queries_docs,
    queries_hooks,
    queries_plan,
    queries_run_graph,
)
from ..models import DECISION_KINDS, FRONTIER_STATUSES, SAFETY_CLASSES, Run
from .deps import Ctx, web_of

router = APIRouter()

SECTIONS: tuple[tuple[str, str], ...] = (
    ("graph", "Graph"),  # where the scan went and what failed, with restarts (spec 035, R-74)
    ("states", "States"),
    ("actions", "Actions"),
    ("frontier", "Frontier"),
    ("forms", "Forms"),
    ("network", "Network"),
    ("robots", "Robots"),
    ("decisions", "Decisions"),
    ("trace", "Trace"),
    ("process", "Process"),  # trace runs only (spec 004 R-14)
    ("docs", "Docs"),  # records citing this run (spec 004 FR-033)
)
SECTION_IDS = {s for s, _ in SECTIONS}
SPAN_STATUSES: tuple[str, ...] = ("running", "ok", "refused", "stopped", "error", "unfinished")
SPAN_CHILD_KINDS: tuple[str, ...] = ("phase", "event")


@router.get("/runs/{run_id}", response_class=HTMLResponse)
def run_detail(
    request: Request, run_id: str, env: str | None = None, tab: str | None = None
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            summary = queries.run_summary(conn, run_id)
            if summary is None:
                return web.not_found(c, run_id)
            if tab not in SECTION_IDS:
                # a scan that stopped or failed somewhere opens on its graph (R-74)
                tab = "graph" if queries_run_graph.needs_attention(conn, run_id) else "states"
            return web.render(
                c,
                "run_detail.html",
                s=summary,
                tab=tab,
                header=header_values(c, conn, summary, tab),
                section=section_values(c, conn, summary.run, tab, request.query_params),
            )
    except db.StoreMissing as err:
        return web.missing(c, err)


@router.get("/fragments/runs/{run_id}/header", response_class=HTMLResponse)
def fragment_header(
    request: Request, run_id: str, env: str | None = None, tab: str = "states"
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    tab = tab if tab in SECTION_IDS else "states"
    try:
        with c.conn() as conn:
            summary = queries.run_summary(conn, run_id)
            if summary is None:
                return web.not_found(c, run_id, fragment=True)
            return web.render(
                c,
                "partials/run_header.html",
                s=summary,
                header=header_values(c, conn, summary, tab),
            )
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)


@router.get("/fragments/runs/{run_id}/{section}", response_class=HTMLResponse)
def fragment_section(
    request: Request, run_id: str, section: str, env: str | None = None, push: bool = False
) -> HTMLResponse:
    if section not in SECTION_IDS:
        raise HTTPException(404)
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            run = queries.get_run(conn, run_id)
            if run is None:
                return web.not_found(c, run_id, fragment=True)
            values = section_values(c, conn, run, section, request.query_params)
            return web.render(
                c,
                f"partials/{section}.html",
                section=values,
                push=values["page_url"] if push else None,
            )
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)


@router.get("/fragments/runs/{run_id}/trace/summary", response_class=HTMLResponse)
def fragment_trace_summary(request: Request, run_id: str, env: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            run = queries.get_run(conn, run_id)
            if run is None:
                return web.not_found(c, run_id, fragment=True)
            return web.render(
                c, "partials/trace_summary.html", section=trace_summary_section(c, conn, run)
            )
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)


@router.get("/fragments/spans/{span_id}/children", response_class=HTMLResponse)
def fragment_span_children(
    request: Request,
    span_id: str,
    env: str | None = None,
    kind: Annotated[list[str], Query()] = [],  # noqa: B006 - FastAPI reads this each request
    name: Annotated[list[str], Query()] = [],  # noqa: B006 - FastAPI reads this each request
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            values = span_children_values(conn, span_id, kind, name)
            return web.render(c, "partials/trace_children.html", **values)
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)


def header_values(c: Ctx, conn: sqlite3.Connection, summary: Any, tab: str) -> dict[str, Any]:
    run: Run = summary.run
    counts = {
        "graph": queries_run_graph.screen_count(conn, run.id),
        "states": summary.states,
        "actions": summary.actions,
        "frontier": summary.frontier,
        "forms": summary.forms,
        "network": summary.network_calls,
        "robots": summary.robots_policies,
        "decisions": summary.decisions,
        # a lightweight count-only call: `trace_calls` with limit=1 still totals every match.
        "trace": queries.trace_calls(conn, run.id, limit=1).total,
        "process": queries_docs.process_step_count(conn, run.id),
        "docs": queries_docs.run_citing_count(conn, run.id),
    }
    # the process tab belongs to trace runs; an old store without process tables never shows it
    show_process = run.mode == "trace" or counts["process"] > 0
    return {
        "self_url": c.url(f"/fragments/runs/{run.id}/header", tab=tab),
        "hooks": queries_hooks.hook_runs(conn, run.id),
        "tab": tab,
        "tabs": [
            (sid, label, counts[sid], c.url(f"/runs/{run.id}", tab=sid))
            for sid, label in SECTIONS
            if sid != "process" or show_process or tab == "process"
        ],
    }


def graph_values(
    conn: sqlite3.Connection, run: Run, params: Any
) -> tuple[dict[str, Any], dict[str, Any]]:
    """The Graph tab: its values and its filter (the selected screen); the note is a restart's."""
    selected = params.get("node") or None
    data = {
        "graph": queries_run_graph.run_graph(conn, run.id),
        "selected": selected,
        "note": params.get("note") or None,
        "node_h": map_layout.NODE_H,
        "variations": queries_plan.VARIATIONS,
    }
    return data, {"node": selected}


def section_values(
    c: Ctx, conn: sqlite3.Connection, run: Run, section: str, params: Any
) -> dict[str, Any]:
    """Values for one run-detail section, with its filters read from the query string.

    `params` supports repeated keys (a `QueryParams` from the request, or a plain dict for a
    single-value section); `trace` is the only section with repeatable filters (`tool`, `status`).
    """
    if section == "trace":
        return trace_calls_values(c, conn, run, params)
    limit = c.settings.page_size
    cursor = params.get("cursor") or None
    page_no = max(int(params.get("page", "1") or 1), 1)
    base = f"/fragments/runs/{run.id}/{section}"
    page_base = f"/runs/{run.id}"
    data, filters = _section_data(conn, run, section, params, limit)

    pg = data.get("page")
    next_cursor = pg.next_cursor if pg else None
    page_arg = page_no if cursor else None
    return {
        "id": section,
        "run": run,
        "filters": filters,
        "page_no": page_no,
        "pages": max(1, -(-pg.total // limit)) if pg else 1,
        "offset": (page_no - 1) * limit,
        "self_url": c.url(base, **filters, cursor=cursor, page=page_arg),
        "page_url": c.url(page_base, tab=section, **filters, cursor=cursor, page=page_arg),
        "fragment_url": base,
        "form_action": page_base,
        "next_url": c.url(page_base, tab=section, **filters, cursor=next_cursor, page=page_no + 1)
        if next_cursor
        else None,
        "next_fragment": c.url(base, **filters, cursor=next_cursor, page=page_no + 1, push=1)
        if next_cursor
        else None,
        "first_url": c.url(page_base, tab=section, **filters) if cursor else None,
        "first_fragment": c.url(base, **filters, push=1) if cursor else None,
        **data,
    }


def _section_data(
    conn: sqlite3.Connection, run: Run, section: str, params: Any, limit: int
) -> tuple[dict[str, Any], dict[str, Any]]:
    """One section's values and its filters (the query string keys it reads)."""
    cursor = params.get("cursor") or None
    filters: dict[str, Any] = {}
    data: dict[str, Any] = {}
    if section == "graph":
        data, filters = graph_values(conn, run, params)
    elif section == "states":
        data["items"] = queries.run_states(conn, run.id)
    elif section == "actions":
        safety = params.get("safety_class")
        safety = safety if safety in SAFETY_CLASSES else None
        allowed_raw = params.get("allowed")
        allowed = {"1": True, "0": False}.get(allowed_raw or "")
        filters = {"safety_class": safety, "allowed": allowed_raw if allowed is not None else None}
        data["page"] = queries.run_actions(conn, run.id, safety, allowed, cursor, limit)
        data["counts"] = queries.action_counts(conn, run.id)
    elif section == "frontier":
        status = params.get("status")
        status = status if status in FRONTIER_STATUSES else None
        filters = {"status": status}
        data["page"] = queries.run_frontier(conn, run.id, status, cursor, limit)
        data["counts"] = queries.frontier_counts(conn, run.id)
    elif section == "forms":
        data["items"] = queries.run_forms(conn, run.id)
    elif section == "network":
        data["page"] = queries.run_network_calls(conn, run.id, cursor, limit)
    elif section == "robots":
        data["items"] = queries.run_robots_policies(conn, run.id)
    elif section == "decisions":
        kind = params.get("kind")
        kind = kind if kind in DECISION_KINDS else None
        rule = params.get("rule") or None
        filters = {"kind": kind, "rule": rule}
        data["page"] = queries.run_decisions(conn, run.id, kind, rule, cursor, limit)
        data["groups"] = queries.decision_groups(conn, run.id)
        data["rules"] = queries.decision_rules(conn, run.id)
    elif section == "docs":
        data["page"] = queries_docs.run_citing_records(conn, run.id, cursor=cursor, limit=limit)
    elif section == "process":
        found = queries_docs.process_for_run(conn, run.id)
        data["process"] = found[0] if found else None
        data["steps"] = found[1] if found else []
        data["diagram"] = process_run_diagram(conn, found) if found else None
    return data, filters


def _multi(params: Any, key: str) -> list[str]:
    """Repeated query values for `key`; works for a `QueryParams` or a plain single-value dict."""
    if hasattr(params, "getlist"):
        return [v for v in params.getlist(key) if v]
    value = params.get(key)
    return [value] if value else []


def agent_context_for_run(conn: sqlite3.Connection, run_id: str) -> dict[str, Any]:
    """Per-call agent context for the trace tab (T034, contracts/agent-import.md "Join"):
    the agent's visible text before a call and the issuing turn's token usage, keyed by
    `tool_use_id`; and the agent's own tool calls that never reached the server."""
    turns = queries.agent_turns_for_run(conn, run_id)
    # usage repeats on every entry of an API message; contracts/agent-import.md attaches it
    # once, to the row with the highest `block_index` for that `api_message_id`
    usage_by_message: dict[str, Any] = {}
    for t in turns:
        if t.api_message_id and (t.input_tokens is not None or t.output_tokens is not None):
            usage_by_message[t.api_message_id] = t
    by_tool_use_id: dict[str, dict[str, Any]] = {}
    unmatched: list[dict[str, Any]] = []
    preceding_text: str | None = None
    for t in turns:
        if t.role == "assistant" and t.kind == "text" and t.text:
            preceding_text = t.text
        if t.kind == "tool_use":
            usage = usage_by_message.get(t.api_message_id) if t.api_message_id else None
            if t.tool_use_id:
                by_tool_use_id[t.tool_use_id] = {"text": preceding_text, "usage": usage}
            if not t.matched and t.tool_name and t.tool_name.startswith("mcp__pathfinder__"):
                unmatched.append({"turn": t, "text": preceding_text})
            preceding_text = None
    return {
        "imported": bool(turns),
        "by_tool_use_id": by_tool_use_id,
        "unmatched_agent_calls": unmatched,
    }


def trace_summary_section(c: Ctx, conn: sqlite3.Connection, run: Run) -> dict[str, Any]:
    """Values shared by the summary's own live region and the trace tab's combined page (T041)."""
    return {
        "summary": queries.trace_summary(conn, run.id),
        "summary_self_url": c.url(f"/fragments/runs/{run.id}/trace/summary"),
        "problems_url": c.url(f"/runs/{run.id}", tab="trace", problems="1"),
    }


def trace_calls_values(c: Ctx, conn: sqlite3.Connection, run: Run, params: Any) -> dict[str, Any]:
    """Values for the trace tab / `/fragments/runs/{run_id}/trace` (contracts/dashboard-routes.md):
    the call list with its `tool`/`status`/`problems` filters, and agent context (T034)."""
    limit = c.settings.page_size
    cursor = params.get("cursor") or None
    page_no = max(int(params.get("page", "1") or 1), 1)
    tools = _multi(params, "tool") or None
    statuses = [s for s in _multi(params, "status") if s in SPAN_STATUSES] or None
    problems = (params.get("problems") or "") in ("1", "true")
    base = f"/fragments/runs/{run.id}/trace"
    page_base = f"/runs/{run.id}"
    result = queries.trace_calls(
        conn, run.id, tools=tools, statuses=statuses, problems=problems, cursor=cursor, limit=limit
    )
    # every call name seen in this run, for the tool filter's options
    tool_options = sorted({s.name for s in queries.trace_calls(conn, run.id, limit=10_000).items})
    filters = {"tool": tools or [], "status": statuses or [], "problems": "1" if problems else ""}
    page_arg = page_no if cursor else None
    agent_ctx = agent_context_for_run(conn, run.id)
    if cursor:  # "never reached server" calls are shown once, on the first page only
        agent_ctx = {**agent_ctx, "unmatched_agent_calls": []}
    return {
        "id": "trace",
        "run": run,
        "filters": filters,
        "problems": problems,
        "tool_options": tool_options,
        "status_options": SPAN_STATUSES,
        "agent_ctx": agent_ctx,
        **trace_summary_section(c, conn, run),
        "page": result,
        "page_no": page_no,
        "pages": max(1, -(-result.total // limit)),
        "offset": (page_no - 1) * limit,
        "self_url": c.url(base, **filters, cursor=cursor, page=page_arg),
        "page_url": c.url(page_base, tab="trace", **filters, cursor=cursor, page=page_arg),
        "fragment_url": base,
        "form_action": page_base,
        "next_url": c.url(
            page_base, tab="trace", **filters, cursor=result.next_cursor, page=page_no + 1
        )
        if result.next_cursor
        else None,
        "next_fragment": c.url(base, **filters, cursor=result.next_cursor, page=page_no + 1, push=1)
        if result.next_cursor
        else None,
        "first_url": c.url(page_base, tab="trace", **filters) if cursor else None,
        "first_fragment": c.url(base, **filters, push=1) if cursor else None,
    }


def span_children_values(
    conn: sqlite3.Connection, span_id: str, kinds: list[str], names: list[str]
) -> dict[str, Any]:
    """Values for `/fragments/spans/{span_id}/children`: phases (each with its own nested
    events), events attached directly to the call, and a total for the proportional phase bar."""
    kinds = [k for k in kinds if k in SPAN_CHILD_KINDS] or None
    names = [n for n in names if n] or None
    children = queries.span_children(conn, span_id, kinds, names)
    phases = [
        {"span": child, "events": queries.span_children(conn, child.id, kinds=["event"])}
        for child in children
        if child.kind == "phase"
    ]
    top_events = [child for child in children if child.kind == "event"]
    total_ms = sum(p["span"].duration_ms or 0 for p in phases)
    call = queries.get_span(conn, span_id)
    return {
        "span_id": span_id,
        "phases": phases,
        "top_events": top_events,
        "total_ms": total_ms or None,
        "run_id": call.run_id if call else None,
    }


def process_run_diagram(conn: sqlite3.Connection, found: Any) -> str | None:
    """Mermaid process map of a trace run's recorded steps (run page `process` tab)."""
    process, steps = found
    if not steps:
        return None
    boundary = None
    if process.outcome == "boundary_reached" and process.boundary_action_id:
        boundary = {
            "action": queries_docs.action_name(conn, process.boundary_action_id) or "boundary",
            "not_observable": process.not_observable or "not observable",
        }
    return diagrams.process_map(
        {
            "process": {"key": "run", "title": process.name},
            "steps": [{"ord": s.ord, "kind": s.kind, "intent": s.intent} for s in steps],
            "boundary": boundary,
        }
    )
