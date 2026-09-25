"""Pure read queries: a connection in, models out. Parameterised SQL only.

Lists are keyset-paginated (research §8): per-run lists on `id` (UUIDv7, so creation order),
the runs list on `(started_at, id)` newest first. Cursors are opaque strings to callers.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import Any

from .models import (
    Action,
    DecisionGroup,
    DecisionLogEntry,
    Form,
    FrontierItem,
    NetworkCall,
    ObservedState,
    Page,
    PortalSummary,
    RobotsPolicy,
    Run,
    RunListItem,
    RunSummary,
    State,
    StateObservation,
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
