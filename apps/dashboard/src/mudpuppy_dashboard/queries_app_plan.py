"""The React console's Plan next scan (screen 14) and a stopped scan's Recover (screen 15) (R-100,
spec 071; spec 034 R-66), as typed JSON over `queries_plan`. Statuses come mapped."""

from __future__ import annotations

import sqlite3

from pydantic import BaseModel

from . import queries_plan
from .queries_app import StatusOut, status_out

#: The scan types a plan starts, with what each does (Continue starts from a stopped scan).
SCAN_TYPES = (
    ("focused", "Focused", "Replays to the Start here and Focus marks and explores from there."),
    ("recheck", "Recheck", "Replays to the Recheck marks and records what each shows now."),
    ("retry", "Retry a path", "Replays to a failed action and tries it again, with a variation."),
)
TYPE_LABELS = {"continue": "Continue a stopped scan", **{t: label for t, label, _ in SCAN_TYPES}}
MARK_ORDER = ("start", "focus", "recheck", "retry", "skip")


class Option(BaseModel):
    value: str
    label: str
    hint: str = ""


class Mark(BaseModel):
    state: str | None
    title: str
    route: str
    #: How a scan reaches it ("replays 3 steps"); None: no recorded way there.
    reach: str | None


class MarkGroup(BaseModel):
    kind: str
    label: str
    marks: list[Mark]


class PlanPage(BaseModel):
    portal: str
    total: int
    types: list[Option]
    groups: list[MarkGroup]
    personas: list[str]
    environments: list[str]
    variations: list[Option]


class Failed(BaseModel):
    transition: str
    label: str
    route: str
    error: str


class Attempt(BaseModel):
    scan: str
    type: str
    variation: str
    status: StatusOut
    passed: bool | None
    started_at: str


class RecoverPage(BaseModel):
    scan: str
    portal: str
    persona: str
    environment: str
    status: StatusOut
    reason: str
    failure_class: str
    steps: int
    pending: int
    #: The last good screen: (state, title, route).
    last_state: tuple[str, str, str] | None
    failed: list[Failed]
    attempts: list[Attempt]
    variations: list[Option]


def _variations() -> list[Option]:
    return [Option(value=v, label=label) for v, label in queries_plan.VARIATIONS]


def plan_page(conn: sqlite3.Connection, portal: str) -> PlanPage:
    p = queries_plan.plan(conn, portal)
    return PlanPage(
        portal=portal,
        total=p.total,
        types=[Option(value=t, label=label, hint=hint) for t, label, hint in SCAN_TYPES],
        groups=[
            MarkGroup(
                kind=kind,
                label=queries_plan.MARK_LABELS[kind],
                marks=[
                    Mark(
                        state=m.target_id if m.target_kind == "state" else None,
                        title=m.title,
                        route=m.route,
                        reach=m.reach,
                    )
                    for m in p.marks.get(kind, [])
                ],
            )
            for kind in MARK_ORDER
        ],
        personas=p.personas,
        environments=p.environments,
        variations=_variations(),
    )


def recover_page(conn: sqlite3.Connection, scan: str) -> RecoverPage | None:
    r = queries_plan.recovery(conn, scan)
    if r is None:
        return None
    stopped = "stopped by the BA or the session" if r.status == "interrupted" else "—"
    return RecoverPage(
        scan=r.run_id,
        portal=r.portal,
        persona=r.persona,
        environment=r.environment,
        status=status_out("run", r.status),
        reason=r.warning or stopped,
        failure_class=r.failure_class,
        steps=r.steps,
        pending=r.pending,
        last_state=r.last_state,
        failed=[
            Failed(transition=f.transition_id, label=f.label, route=f.route, error=f.error)
            for f in r.failed
        ],
        attempts=[
            Attempt(
                scan=a.run_id,
                type=TYPE_LABELS.get(a.run_type, a.run_type),
                variation=a.variation.replace("_", " "),
                status=status_out("run", a.status),
                passed=a.passed,
                started_at=a.started_at,
            )
            for a in r.attempts
        ],
        variations=_variations(),
    )
