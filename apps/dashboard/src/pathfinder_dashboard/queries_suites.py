"""Read models for probe suites and probe outcomes (spec 032): the suites the BA proposed that wait
for the owner in Review, and the outcomes of the probes on one form step (the screen page's
"States of this step"). Read-only; a store older than migration 0023 gives nothing."""

from __future__ import annotations

import json
import sqlite3
from typing import Any, NamedTuple


class SuiteVariant(NamedTuple):
    id: str
    expect: str
    probe: str | None
    fault: str | None
    why: str
    steps: int
    # The variant's steps (its own, else the trace's), for editing in Review (owner 2026-10-17).
    step_rows: list[dict[str, Any]]


class SuiteItem(NamedTuple):
    id: str
    trace_id: str
    name: str
    goal: str
    start_url: str
    run_id: str
    step_label: str | None
    variants: list[SuiteVariant]
    created_at: str
    trace: dict[str, Any]


class StepOutcome(NamedTuple):
    id: str
    probe: str
    group: str
    target: str | None
    kind: str
    fault: str | None
    to_state: str | None
    messages: list[dict[str, Any]]
    accepted: bool
    possible_new_process: bool
    reason: str | None
    run_id: str


class StepState(NamedTuple):
    id: str
    title: str
    kind: str


class ProbeMark(NamedTuple):
    """An open Probe mark on a form step (spec 032 US5): a person's instruction for the next
    form-probing scan."""

    id: str
    by: str
    at: str


class FormStepView(NamedTuple):
    id: str
    step_index: int
    label: str
    route: str
    states: list[StepState]
    outcomes: list[StepOutcome]
    portal: str
    mark: ProbeMark | None

    def group_counts(self) -> list[tuple[str, int]]:
        """Outcomes per probe group, for the coverage chips (design screen 13)."""
        groups = ("validation", "branch", "technical")
        return [(g, sum(1 for o in self.outcomes if o.group == g)) for g in groups]


class StepCoverage(NamedTuple):
    """Probe coverage of one form step (spec 032 US5): marked, probed or not probed."""

    form_step_id: str
    marked: bool
    outcomes: int


class StepSummary(NamedTuple):
    total: int
    marked: int
    unprobed: int


def step_summary(coverage: dict[str, StepCoverage]) -> StepSummary:
    """Form steps counted once each: how many are marked and how many were never probed."""
    steps = {c.form_step_id: c for c in coverage.values()}.values()
    return StepSummary(
        len(steps),
        sum(1 for c in steps if c.marked),
        sum(1 for c in steps if not c.marked and c.outcomes == 0),
    )


def probe_mark(conn: sqlite3.Connection, form_step_id: str) -> ProbeMark | None:
    """The step's open Probe mark; None when it has none or the store predates migration 0024."""
    rows = _rows(
        conn,
        "SELECT id, created_by, created_at FROM marks WHERE kind = 'probe'"
        " AND form_step_id = ? AND used_by_run_id IS NULL",
        (form_step_id,),
    )
    return ProbeMark(rows[0]["id"], rows[0]["created_by"], rows[0]["created_at"]) if rows else None


def step_coverage(conn: sqlite3.Connection, portal: str | None) -> dict[str, StepCoverage]:
    """Probe coverage per state of a form step, keyed by state id, for the Screens list."""
    where, args = ("WHERE s.portal_id = ?", (portal,)) if portal else ("", ())
    rows = _rows(
        conn,
        "SELECT s.id AS state_id, s.form_step_id,"
        " EXISTS (SELECT 1 FROM marks m WHERE m.kind = 'probe'"
        "   AND m.form_step_id = s.form_step_id AND m.used_by_run_id IS NULL) AS marked,"
        " (SELECT COUNT(*) FROM probe_outcomes o WHERE o.form_step_id = s.form_step_id"
        "   AND o.probe_id <> 'happy-path') AS outcomes"
        f" FROM states s {where}{' AND' if where else ' WHERE'} s.form_step_id IS NOT NULL",
        args,
    )
    return {
        r["state_id"]: StepCoverage(r["form_step_id"], bool(r["marked"]), r["outcomes"])
        for r in rows
    }


def _rows(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []


def _suite(r: sqlite3.Row) -> SuiteItem:
    trace = json.loads(r["trace_json"])
    why = {n["variant"]: n["why"] for n in json.loads(r["notes_json"])}
    variants = []
    for v in trace.get("variants", []):
        rows = list(v.get("steps") or trace.get("steps") or [])
        variants.append(
            SuiteVariant(
                v["id"],
                v["expect"],
                v.get("probe"),
                v.get("fault"),
                why.get(v["id"], ""),
                len(rows),
                rows,
            )
        )
    return SuiteItem(
        r["id"],
        trace["id"],
        trace["name"],
        trace["goal"],
        trace["start_url"],
        r["run_id"],
        r["label"],
        variants,
        r["created_at"],
        trace,
    )


def open_suites(conn: sqlite3.Connection, portal: str) -> list[SuiteItem]:
    """Suites the owner has not approved or dismissed yet, oldest first (FR-009)."""
    rows = _rows(
        conn,
        "SELECT s.*, f.label FROM probe_suites s LEFT JOIN form_steps f ON f.id = s.form_step_id"
        " WHERE s.portal_id = ? AND s.status = 'open' ORDER BY s.created_at, s.id",
        (portal,),
    )
    return [_suite(r) for r in rows]


def suite_by_id(conn: sqlite3.Connection, portal: str, suite_id: str) -> SuiteItem | None:
    """One open suite of the portal (the editor's form is built over it)."""
    rows = _rows(
        conn,
        "SELECT s.*, f.label FROM probe_suites s LEFT JOIN form_steps f ON f.id = s.form_step_id"
        " WHERE s.portal_id = ? AND s.id = ? AND s.status = 'open'",
        (portal, suite_id),
    )
    return _suite(rows[0]) if rows else None


def open_suite_count(conn: sqlite3.Connection, portal: str) -> int:
    rows = _rows(
        conn,
        "SELECT count(*) FROM probe_suites WHERE portal_id = ? AND status = 'open'",
        (portal,),
    )
    return int(rows[0][0]) if rows else 0


def form_step_of_state(conn: sqlite3.Connection, state_id: str) -> FormStepView | None:
    """The form step a state belongs to, its states with their kinds, and every probe outcome
    started from it (a cut of design screen 13)."""
    head = _rows(
        conn,
        "SELECT f.id, f.step_index, f.label, f.route_template, f.portal_id FROM states s"
        " JOIN form_steps f ON f.id = s.form_step_id WHERE s.id = ?",
        (state_id,),
    )
    if not head:
        return None
    f = head[0]
    states = [
        StepState(r["id"], r["title"], r["state_kind"])
        for r in _rows(
            conn,
            "SELECT id, title, state_kind FROM states WHERE form_step_id = ? ORDER BY created_at",
            (f["id"],),
        )
    ]
    outcomes = [
        StepOutcome(
            r["id"],
            r["probe_id"],
            r["probe_group"],
            r["target"],
            r["outcome_kind"],
            r["fault"],
            r["to_state_id"],
            json.loads(r["messages_json"]),
            bool(r["accepted"]),
            bool(r["possible_new_process"]),
            r["reason"],
            r["run_id"],
        )
        for r in _rows(
            conn,
            "SELECT * FROM probe_outcomes WHERE form_step_id = ? AND probe_id NOT IN ('happy-path')"
            " ORDER BY created_at",
            (f["id"],),
        )
    ]
    return FormStepView(
        f["id"],
        f["step_index"],
        f["label"],
        f["route_template"],
        states,
        outcomes,
        f["portal_id"],
        probe_mark(conn, f["id"]),
    )
