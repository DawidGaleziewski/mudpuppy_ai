"""What a scan's Trace and Process tabs read beyond `queries`, shared by the htmx router
(`web/runs.py`) and the React console's API (`queries_app_trace.py`), G-13: the agent's context
for each tool call, and a trace run's process drawn as a Mermaid map. Read-only."""

from __future__ import annotations

import sqlite3
from typing import Any

from . import diagrams, queries, queries_docs


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
            if not t.matched and t.tool_name and t.tool_name.startswith("mcp__mudpuppy__"):
                unmatched.append({"turn": t, "text": preceding_text})
            preceding_text = None
    return {
        "imported": bool(turns),
        "by_tool_use_id": by_tool_use_id,
        "unmatched_agent_calls": unmatched,
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
