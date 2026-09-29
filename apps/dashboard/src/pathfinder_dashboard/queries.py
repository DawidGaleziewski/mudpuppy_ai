"""Pure read queries: a connection in, models out. Parameterised SQL only.

Lists are keyset-paginated (research §8): per-run lists on `id` (UUIDv7, so creation order),
the runs list on `(started_at, id)` newest first. Cursors are opaque strings to callers.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Any

from .models import (
    Action,
    AgentTurn,
    DecisionGroup,
    DecisionLogEntry,
    Form,
    FrontierItem,
    NetworkCall,
    ObservedState,
    Page,
    PhaseStat,
    PortalSummary,
    RobotsPolicy,
    Run,
    RunListItem,
    RunSummary,
    State,
    StateObservation,
    TraceHealth,
    TraceSpan,
    TraceSummary,
    TraceTokens,
)

DEFAULT_LIMIT = 50
_SEP = "\x1f"


def _rows(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
    return conn.execute(sql, args).fetchall()


def _count(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...] = ()) -> int:
    return conn.execute(sql, args).fetchone()[0]


def _where(filters: dict[str, Any]) -> tuple[str, tuple[Any, ...]]:
    """`col = ?` clauses for the filters that are set."""
    active = {k: v for k, v in filters.items() if v is not None}
    clause = " AND ".join(f"{col} = ?" for col in active)
    return clause, tuple(active.values())


def _page[M](
    conn: sqlite3.Connection,
    model: type[M],
    table: str,
    filters: dict[str, Any],
    cursor: str | None,
    limit: int,
) -> Page[M]:
    """Keyset page over `table` ordered by `id` ascending."""
    where, args = _where(filters)
    total = _count(conn, f"SELECT count(*) FROM {table} WHERE {where}", args)
    keyset = " AND id > ?" if cursor else ""
    rows = _rows(
        conn,
        f"SELECT * FROM {table} WHERE {where}{keyset} ORDER BY id LIMIT ?",
        (*args, *((cursor,) if cursor else ()), limit + 1),
    )
    items = [model.model_validate(dict(r)) for r in rows[:limit]]  # type: ignore[attr-defined]
    next_cursor = items[-1].id if len(rows) > limit else None  # type: ignore[attr-defined]
    return Page[model](items=items, total=total, next_cursor=next_cursor)  # type: ignore[valid-type]


def _ms(start: str, end: str) -> int:
    return int((datetime.fromisoformat(end) - datetime.fromisoformat(start)).total_seconds() * 1000)


def duration_ms(run: Run) -> int | None:
    """Wall time for a finished run; accumulated active time while it is running."""
    if run.status == "running" or not run.ended_at:
        return run.elapsed_ms if run.status == "running" else None
    return _ms(run.started_at, run.ended_at)


# --- overview (US1) ---------------------------------------------------------------------------


def portals(conn: sqlite3.Connection) -> list[str]:
    return [
        r[0]
        for r in _rows(
            conn,
            "SELECT portal_id FROM runs UNION SELECT portal_id FROM states ORDER BY 1",
        )
    ]


def _per_portal(conn: sqlite3.Connection, sql: str) -> dict[str, int]:
    return {r[0]: r[1] for r in _rows(conn, sql)}


def portal_summaries(conn: sqlite3.Connection) -> list[PortalSummary]:
    runs_by: dict[str, dict[str, int]] = {}
    last_run: dict[str, str] = {}
    for r in _rows(
        conn,
        "SELECT portal_id, status, count(*), max(started_at) FROM runs GROUP BY portal_id, status",
    ):
        runs_by.setdefault(r[0], {})[r[1]] = r[2]
        last_run[r[0]] = max(last_run.get(r[0], ""), r[3])

    def via_runs(table: str, extra: str = "") -> dict[str, int]:
        return _per_portal(
            conn,
            f"SELECT r.portal_id, count(*) FROM {table} t JOIN runs r ON r.id = t.run_id"
            f" {extra} GROUP BY r.portal_id",
        )

    states = _per_portal(conn, "SELECT portal_id, count(*) FROM states GROUP BY portal_id")
    allowed = via_runs("actions", "WHERE t.allowed = 1")
    skipped = via_runs("actions", "WHERE t.allowed = 0")
    forms = via_runs("forms")
    network = via_runs("network_calls")
    questions = via_runs("open_questions", "WHERE t.status = 'open'")
    rules = via_runs("rule_candidates")
    return [
        PortalSummary(
            portal_id=p,
            runs_by_status=runs_by.get(p, {}),  # type: ignore[arg-type]
            last_run_at=last_run.get(p),
            states=states.get(p, 0),
            actions_allowed=allowed.get(p, 0),
            actions_skipped=skipped.get(p, 0),
            forms=forms.get(p, 0),
            network_calls=network.get(p, 0),
            open_questions_open=questions.get(p, 0),
            rule_candidates=rules.get(p, 0),
        )
        for p in portals(conn)
    ]


def list_runs(
    conn: sqlite3.Connection,
    portal: str | None = None,
    status: str | None = None,
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> Page[RunListItem]:
    where, args = _where({"portal_id": portal, "status": status})
    where = where or "1"
    total = _count(conn, f"SELECT count(*) FROM runs WHERE {where}", args)
    keyset, kargs = "", ()
    if cursor:
        started, _, run_id = cursor.partition(_SEP)
        keyset = " AND (started_at < ? OR (started_at = ? AND id < ?))"
        kargs = (started, started, run_id)
    rows = _rows(
        conn,
        f"SELECT * FROM runs WHERE {where}{keyset} ORDER BY started_at DESC, id DESC LIMIT ?",
        (*args, *kargs, limit + 1),
    )
    runs = [Run.model_validate(dict(r)) for r in rows[:limit]]
    next_cursor = None
    if len(rows) > limit:
        next_cursor = f"{runs[-1].started_at}{_SEP}{runs[-1].id}"
    return Page[RunListItem](
        items=[RunListItem(run=r, duration_ms=duration_ms(r)) for r in runs],
        total=total,
        next_cursor=next_cursor,
    )


# --- run detail (US2) -------------------------------------------------------------------------


def get_run(conn: sqlite3.Connection, run_id: str) -> Run | None:
    row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
    return Run.model_validate(dict(row)) if row else None


def _grouped(conn: sqlite3.Connection, table: str, column: str, run_id: str) -> dict[str, int]:
    return {
        r[0]: r[1]
        for r in _rows(
            conn,
            f"SELECT {column}, count(*) FROM {table} WHERE run_id = ?"
            f" GROUP BY {column} ORDER BY count(*) DESC, {column}",
            (run_id,),
        )
    }


def run_summary(conn: sqlite3.Connection, run_id: str) -> RunSummary | None:
    run = get_run(conn, run_id)
    if run is None:
        return None

    def n(table: str) -> int:
        return _count(conn, f"SELECT count(*) FROM {table} WHERE run_id = ?", (run_id,))

    frontier_by = frontier_counts(conn, run_id)
    decisions_by = _grouped(conn, "decision_log", "kind", run_id)
    return RunSummary(
        run=run,
        duration_ms=duration_ms(run),
        states=n("state_observations"),
        actions=n("actions"),
        frontier=sum(frontier_by.values()),
        frontier_by_status=frontier_by,  # type: ignore[arg-type]
        forms=n("forms"),
        network_calls=n("network_calls"),
        robots_policies=n("robots_policies"),
        decisions=sum(decisions_by.values()),
        decisions_by_kind=decisions_by,  # type: ignore[arg-type]
        edges=n("edges"),
        open_questions=n("open_questions"),
        rule_candidates=n("rule_candidates"),
    )


def run_states(conn: sqlite3.Connection, run_id: str) -> list[ObservedState]:
    rows = _rows(
        conn,
        "SELECT s.*, o.run_id AS o_run_id, o.state_id AS o_state_id,"
        " o.persona_id AS o_persona_id, o.evidence_ref AS o_evidence_ref,"
        " o.observed_at AS o_observed_at"
        " FROM state_observations o JOIN states s ON s.id = o.state_id"
        " WHERE o.run_id = ? ORDER BY o.observed_at, s.id",
        (run_id,),
    )
    out = []
    for r in rows:
        d = dict(r)
        obs = {k[2:]: d.pop(k) for k in list(d) if k.startswith("o_")}
        out.append(
            ObservedState(
                state=State.model_validate(d),
                observation=StateObservation.model_validate(obs),
            )
        )
    return out


def action_counts(conn: sqlite3.Connection, run_id: str) -> dict[tuple[str, bool], int]:
    return {
        (r[0], bool(r[1])): r[2]
        for r in _rows(
            conn,
            "SELECT safety_class, allowed, count(*) FROM actions WHERE run_id = ?"
            " GROUP BY safety_class, allowed ORDER BY count(*) DESC",
            (run_id,),
        )
    }


def run_actions(
    conn: sqlite3.Connection,
    run_id: str,
    safety_class: str | None = None,
    allowed: bool | None = None,
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> Page[Action]:
    filters = {
        "run_id": run_id,
        "safety_class": safety_class,
        "allowed": None if allowed is None else int(allowed),
    }
    return _page(conn, Action, "actions", filters, cursor, limit)


def frontier_counts(conn: sqlite3.Connection, run_id: str) -> dict[str, int]:
    return _grouped(conn, "frontier", "status", run_id)


def run_frontier(
    conn: sqlite3.Connection,
    run_id: str,
    status: str | None = None,
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> Page[FrontierItem]:
    filters = {"run_id": run_id, "status": status}
    return _page(conn, FrontierItem, "frontier", filters, cursor, limit)


def run_forms(conn: sqlite3.Connection, run_id: str) -> list[Form]:
    rows = _rows(conn, "SELECT * FROM forms WHERE run_id = ? ORDER BY id", (run_id,))
    return [Form.model_validate(dict(r)) for r in rows]


def run_network_calls(
    conn: sqlite3.Connection,
    run_id: str,
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> Page[NetworkCall]:
    return _page(conn, NetworkCall, "network_calls", {"run_id": run_id}, cursor, limit)


def run_robots_policies(conn: sqlite3.Connection, run_id: str) -> list[RobotsPolicy]:
    rows = _rows(
        conn,
        "SELECT * FROM robots_policies WHERE run_id = ? ORDER BY fetched_at, id",
        (run_id,),
    )
    return [RobotsPolicy.model_validate(dict(r)) for r in rows]


def decision_groups(conn: sqlite3.Connection, run_id: str) -> list[DecisionGroup]:
    rows = _rows(
        conn,
        "SELECT kind, rule, count(*) AS n, min(reason) AS example FROM decision_log"
        " WHERE run_id = ? GROUP BY kind, rule ORDER BY n DESC, kind, rule",
        (run_id,),
    )
    return [
        DecisionGroup(kind=r["kind"], rule=r["rule"], count=r["n"], example_reason=r["example"])
        for r in rows
    ]


def decision_rules(conn: sqlite3.Connection, run_id: str) -> list[str]:
    """Rules seen in a run's decision log, most frequent first (for the rule filter)."""
    return list(dict.fromkeys(g.rule for g in decision_groups(conn, run_id) if g.rule))


def run_decisions(
    conn: sqlite3.Connection,
    run_id: str,
    kind: str | None = None,
    rule: str | None = None,
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> Page[DecisionLogEntry]:
    filters = {"run_id": run_id, "kind": kind, "rule": rule}
    return _page(conn, DecisionLogEntry, "decision_log", filters, cursor, limit)


# --- trace (US1/US2) --------------------------------------------------------------------------


def _p95_call_duration(conn: sqlite3.Connection, run_id: str) -> int | None:
    """p95 duration of the run's completed call spans, or None with fewer than 2 of them."""
    durations = [
        r[0]
        for r in _rows(
            conn,
            "SELECT duration_ms FROM trace_spans WHERE run_id = ? AND kind = 'call'"
            " AND status = 'ok' AND duration_ms IS NOT NULL ORDER BY duration_ms",
            (run_id,),
        )
    ]
    if len(durations) < 2:
        return None
    return durations[int(0.95 * len(durations))]


def _problem_sql(p95: int | None) -> str:
    clause = (
        "(s.status IN ('error','refused','stopped','unfinished')"
        " OR EXISTS (SELECT 1 FROM trace_spans c WHERE c.parent_id = s.id"
        "   AND c.name IN ('stabilization_timeout','concurrent_calls'))"
        " OR (s.tool_use_id IS NOT NULL"
        "   AND EXISTS (SELECT 1 FROM agent_turns WHERE run_id = s.run_id)"
        "   AND NOT EXISTS (SELECT 1 FROM agent_turns t"
        "     WHERE t.tool_use_id = s.tool_use_id AND t.kind = 'tool_use'))"
    )
    if p95 is not None:
        clause += " OR (s.duration_ms IS NOT NULL AND s.duration_ms > ?)"
    return clause + ")"


def trace_calls(
    conn: sqlite3.Connection,
    run_id: str,
    tools: list[str] | None = None,
    statuses: list[str] | None = None,
    problems: bool = False,
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> Page[TraceSpan]:
    """A run's call spans, ordered by boot start then seq (a run's spans may span boots)."""
    where = ["s.run_id = ?", "s.kind = 'call'"]
    args: list[Any] = [run_id]
    if tools:
        where.append(f"s.name IN ({','.join('?' * len(tools))})")
        args.extend(tools)
    if statuses:
        where.append(f"s.status IN ({','.join('?' * len(statuses))})")
        args.extend(statuses)
    if problems:
        p95 = _p95_call_duration(conn, run_id)
        where.append(_problem_sql(p95))
        if p95 is not None:
            args.append(p95)
    where_sql = " AND ".join(where)
    joined = "trace_spans s JOIN trace_boots b ON b.id = s.boot_id"
    total = _count(conn, f"SELECT count(*) FROM {joined} WHERE {where_sql}", tuple(args))
    keyset, kargs = "", ()
    if cursor:
        started, _, seq = cursor.partition(_SEP)
        keyset = " AND (b.started_at > ? OR (b.started_at = ? AND s.seq > ?))"
        kargs = (started, started, int(seq))
    rows = _rows(
        conn,
        f"SELECT s.*, b.started_at AS boot_started_at FROM {joined}"
        f" WHERE {where_sql}{keyset} ORDER BY b.started_at, s.seq LIMIT ?",
        (*args, *kargs, limit + 1),
    )
    items = [TraceSpan.model_validate(dict(r)) for r in rows[:limit]]
    next_cursor = None
    if len(rows) > limit:
        last = rows[limit - 1]
        next_cursor = f"{last['boot_started_at']}{_SEP}{last['seq']}"
    return Page[TraceSpan](items=items, total=total, next_cursor=next_cursor)


def agent_turns_for_run(conn: sqlite3.Connection, run_id: str) -> list[AgentTurn]:
    """A run's agent turns in transcript order (contracts/agent-import.md "Join")."""
    rows = _rows(
        conn,
        "SELECT * FROM agent_turns WHERE run_id = ? ORDER BY created_at, block_index, id",
        (run_id,),
    )
    return [AgentTurn.model_validate(dict(r)) for r in rows]


def get_span(conn: sqlite3.Connection, span_id: str) -> TraceSpan | None:
    rows = _rows(conn, "SELECT * FROM trace_spans WHERE id = ?", (span_id,))
    return TraceSpan.model_validate(dict(rows[0])) if rows else None


def span_children(
    conn: sqlite3.Connection,
    span_id: str,
    kinds: list[str] | None = None,
    names: list[str] | None = None,
) -> list[TraceSpan]:
    where = ["parent_id = ?"]
    args: list[Any] = [span_id]
    if kinds:
        where.append(f"kind IN ({','.join('?' * len(kinds))})")
        args.extend(kinds)
    if names:
        where.append(f"name IN ({','.join('?' * len(names))})")
        args.extend(names)
    rows = _rows(
        conn,
        f"SELECT * FROM trace_spans WHERE {' AND '.join(where)} ORDER BY seq",
        tuple(args),
    )
    return [TraceSpan.model_validate(dict(r)) for r in rows]


def server_activity(
    conn: sqlite3.Connection,
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> Page[TraceSpan]:
    """Run-less calls (FR-016), newest first."""
    where = "kind = 'call' AND run_id IS NULL"
    total = _count(conn, f"SELECT count(*) FROM trace_spans WHERE {where}")
    keyset, kargs = "", ()
    if cursor:
        started, _, span_id = cursor.partition(_SEP)
        keyset = " AND (started_at < ? OR (started_at = ? AND id < ?))"
        kargs = (started, started, span_id)
    rows = _rows(
        conn,
        f"SELECT * FROM trace_spans WHERE {where}{keyset}"
        " ORDER BY started_at DESC, id DESC LIMIT ?",
        (*kargs, limit + 1),
    )
    items = [TraceSpan.model_validate(dict(r)) for r in rows[:limit]]
    next_cursor = None
    if len(rows) > limit:
        last = items[-1]
        next_cursor = f"{last.started_at}{_SEP}{last.id}"
    return Page[TraceSpan](items=items, total=total, next_cursor=next_cursor)


def _percentile(sorted_values: list[int], p: float) -> int:
    """Nearest-rank percentile of an already-sorted list (empty → 0)."""
    if not sorted_values:
        return 0
    idx = min(len(sorted_values) - 1, round(p * (len(sorted_values) - 1)))
    return sorted_values[idx]


def _trace_health(conn: sqlite3.Connection, run_id: str) -> tuple[int, int]:
    """`dropped`/`truncated` are cumulative counters; `trace_health` is only re-emitted when they
    change (tracer.ts), so the run's last one (by `seq`) holds the totals
    (contracts/trace-spans.md)."""
    rows = _rows(
        conn,
        "SELECT s.attrs_json FROM trace_spans s JOIN trace_boots b ON b.id = s.boot_id"
        " WHERE s.run_id = ? AND s.kind = 'event' AND s.name = 'trace_health'"
        " ORDER BY b.started_at DESC, s.seq DESC LIMIT 1",
        (run_id,),
    )
    if not rows:
        return 0, 0
    attrs = json.loads(rows[0]["attrs_json"])
    return int(attrs.get("dropped", 0)), int(attrs.get("truncated", 0))


def trace_summary(conn: sqlite3.Connection, run_id: str) -> TraceSummary | None:
    """A run's trace summary (T041, contracts/dashboard-routes.md "Summary"): `None` when the run
    has no trace at all (predates tracing, or never reached the server)."""
    calls = _rows(
        conn,
        "SELECT name, status, duration_ms FROM trace_spans WHERE run_id = ? AND kind = 'call'",
        (run_id,),
    )
    if not calls:
        return None
    calls_by_tool: dict[str, int] = {}
    calls_by_status: dict[str, int] = {}
    for r in calls:
        calls_by_tool[r["name"]] = calls_by_tool.get(r["name"], 0) + 1
        calls_by_status[r["status"]] = calls_by_status.get(r["status"], 0) + 1

    phase_rows = _rows(
        conn,
        "SELECT name, duration_ms FROM trace_spans"
        " WHERE run_id = ? AND kind = 'phase' AND duration_ms IS NOT NULL",
        (run_id,),
    )
    by_phase: dict[str, list[int]] = {}
    for r in phase_rows:
        by_phase.setdefault(r["name"], []).append(r["duration_ms"])
    phases = []
    for name in sorted(by_phase):
        durations = sorted(by_phase[name])
        phases.append(
            PhaseStat(
                name=name,
                count=len(durations),
                sum_ms=sum(durations),
                p50_ms=_percentile(durations, 0.50),
                p95_ms=_percentile(durations, 0.95),
            )
        )

    slowest_rows = _rows(
        conn,
        "SELECT * FROM trace_spans WHERE run_id = ? AND kind = 'call' AND duration_ms IS NOT NULL"
        " ORDER BY duration_ms DESC LIMIT 5",
        (run_id,),
    )
    slowest_calls = [TraceSpan.model_validate(dict(r)) for r in slowest_rows]

    tok = _rows(
        conn,
        "SELECT count(*) AS turns, coalesce(sum(input_tokens), 0) AS input_tokens,"
        " coalesce(sum(output_tokens), 0) AS output_tokens,"
        " coalesce(sum(cache_read_tokens), 0) AS cache_read_tokens,"
        " coalesce(sum(cache_creation_tokens), 0) AS cache_creation_tokens"
        " FROM agent_turns WHERE run_id = ? AND kind = 'tool_use'",
        (run_id,),
    )[0]
    tokens = TraceTokens(
        turns=tok["turns"],
        input_tokens=tok["input_tokens"],
        output_tokens=tok["output_tokens"],
        cache_read_tokens=tok["cache_read_tokens"],
        cache_creation_tokens=tok["cache_creation_tokens"],
    )

    dropped, truncated = _trace_health(conn, run_id)
    unfinished = _count(
        conn,
        "SELECT count(*) FROM trace_spans"
        " WHERE run_id = ? AND kind = 'call' AND status = 'unfinished'",
        (run_id,),
    )
    agent_imported = (
        _count(conn, "SELECT count(*) FROM agent_turns WHERE run_id = ?", (run_id,)) > 0
    )
    unmatched_agent_calls = 0
    unmatched_server_calls = 0
    if agent_imported:
        unmatched_agent_calls = _count(
            conn,
            "SELECT count(*) FROM agent_turns"
            " WHERE run_id = ? AND kind = 'tool_use' AND matched = 0"
            " AND substr(tool_name, 1, 17) = 'mcp__pathfinder__'",
            (run_id,),
        )
        unmatched_server_calls = _count(
            conn,
            "SELECT count(*) FROM trace_spans s"
            " WHERE s.run_id = ? AND s.kind = 'call' AND s.tool_use_id IS NOT NULL"
            " AND NOT EXISTS (SELECT 1 FROM agent_turns t"
            "   WHERE t.tool_use_id = s.tool_use_id AND t.kind = 'tool_use')",
            (run_id,),
        )
    health = TraceHealth(
        dropped=dropped,
        truncated=truncated,
        unfinished=unfinished,
        unmatched_agent_calls=unmatched_agent_calls,
        unmatched_server_calls=unmatched_server_calls,
    )

    boots = _rows(
        conn,
        "SELECT DISTINCT b.trace_level, b.pw_trace FROM trace_spans s"
        " JOIN trace_boots b ON b.id = s.boot_id WHERE s.run_id = ?",
        (run_id,),
    )
    return TraceSummary(
        run_id=run_id,
        calls_total=len(calls),
        calls_by_tool=calls_by_tool,
        calls_by_status=calls_by_status,
        phases=phases,
        slowest_calls=slowest_calls,
        tokens=tokens,
        health=health,
        trace_levels=[b["trace_level"] for b in boots],
        pw_trace_modes=[b["pw_trace"] for b in boots],
        agent_imported=agent_imported,
    )
