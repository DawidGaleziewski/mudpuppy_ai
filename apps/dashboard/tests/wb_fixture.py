"""The designer's Workbench fixture (13-v2-fixtures.md § Workbench) as store rows: scan 01a110d5 on
reference-insurer, six route pages at steps 12, 38, 77, 102, 140 and 167, 11 side trips
(+2 +2 +2 +1 +2 +2), the failed press of "Wyślij" at step 170 and the stop at step 171; last good
checkpoint /porownanie."""

from __future__ import annotations

import json
import sqlite3

from .conftest import EVIDENCE, insert

RUN = "01a110d5-0000-7000-8000-000000000001"
PORTAL = "reference-insurer"
BOOT = "boot-wb"
STOP_ERROR = "element not found after 10 s"

# (route, title, step, side trips after it)
ROUTE_PAGES = (
    ("/", "Ubezpieczenia dla Ciebie", 12, 2),
    ("/ubezpieczenia/samochod", "Samochód", 38, 2),
    ("/kalkulator/kierowca", "Kalkulator OC/AC — dane kierowcy", 77, 2),
    ("/kalkulator/kierowca", "Kalkulator OC/AC — opcje", 102, 1),
    ("/porownanie", "Porównanie", 140, 2),
    ("/kontakt", "Kontakt", 167, 2),
)
FAILED_STEP = 170
LAST_CALL = 170


def at(step: int) -> str:
    """10:47:00Z plus two seconds a step (the fixture's clock, roughly)."""
    minute, second = divmod(step * 2, 60)
    return f"2026-10-06T10:{47 + minute:02d}:{second:02d}.000Z"


def _span(conn: sqlite3.Connection, span_id: str, seq: int, **row: object) -> None:
    insert(conn, "trace_spans", id=span_id, boot_id=BOOT, seq=seq, run_id=RUN, **row)


def _state(conn: sqlite3.Connection, state_id: str, route: str, title: str) -> None:
    insert(
        conn,
        "states",
        id=state_id,
        portal_id=PORTAL,
        fingerprint=f"fp-{state_id}",
        cluster_id=f"cl-{state_id}",
        route_template=route,
        title=title,
        first_seen_run=RUN,
    )


def _visit(conn: sqlite3.Connection, step: int, state_id: str) -> None:
    """A navigate call whose record phase records `state_id`."""
    call = f"call-{step}"
    _span(conn, call, step * 10, name="navigate", started_at=at(step))
    _span(conn, f"phase-{step}", step * 10 + 1, parent_id=call, kind="phase", name="record_state")
    _span(
        conn,
        f"ev-{step}",
        step * 10 + 2,
        parent_id=f"phase-{step}",
        kind="event",
        name="state_recorded",
        ended_at=None,
        duration_ms=None,
        attrs_json=json.dumps({"state_id": state_id, "created": True, "evidence_ref": EVIDENCE}),
    )
    insert(conn, "state_observations", run_id=RUN, state_id=state_id)


def _act(conn: sqlite3.Connection, step: int, state_id: str, failed: bool = False) -> None:
    action = f"action-{step}"
    insert(conn, "actions", id=action, run_id=RUN, state_id=state_id, accessible_name="Wyślij")
    args = {"run_id": RUN, "action_id": action, "intent": 'press "Wyślij"'}
    call = f"call-{step}"
    _span(
        conn,
        call,
        step * 10,
        name="act",
        status="refused" if failed else "ok",
        started_at=at(step),
        attrs_json=json.dumps({"args": args}),
    )
    if failed:
        _span(
            conn,
            f"err-{step}",
            step * 10 + 1,
            parent_id=call,
            kind="event",
            name="error",
            ended_at=None,
            duration_ms=None,
            attrs_json=json.dumps({"code": "ACTION_REFUSED", "message": STOP_ERROR}),
        )


def seed_wb_scan(conn: sqlite3.Connection, *, stopped: bool = True) -> None:
    """The fixture scan; `stopped=False` leaves it running, the crawler just arrived on /kontakt."""
    insert(
        conn,
        "runs",
        id=RUN,
        portal_id=PORTAL,
        environment="sandbox",
        status="interrupted" if stopped else "running",
        started_at=at(1),
        ended_at=at(LAST_CALL + 1) if stopped else None,
    )
    insert(conn, "trace_boots", id=BOOT, environment="sandbox")
    _span(conn, "call-1", 10, name="start_run", started_at=at(1))
    planned: dict[int, tuple[str, str, str]] = {}
    route_state: dict[int, str] = {}
    for i, (route, title, step, sides) in enumerate(ROUTE_PAGES, start=1):
        planned[step] = (f"st-{i}", route, title)
        for s in range(1, sides + 1):
            planned[step + s] = (f"st-{i}-side-{s}", f"{route.rstrip('/')}/side-{s}", f"Side {s}")
        for later in range(step, 10_000):
            route_state[later] = f"st-{i}"
    last = LAST_CALL if stopped else ROUTE_PAGES[-1][2]
    for step in range(2, last + 1):
        if step in planned:
            state_id, route, title = planned[step]
            _state(conn, state_id, route, title)
            _visit(conn, step, state_id)
        elif step in route_state:
            _act(conn, step, route_state[step], failed=stopped and step == FAILED_STEP)
        else:
            _span(
                conn, f"call-{step}", step * 10, name="get_next_frontier_item", started_at=at(step)
            )
    for n in range(113):
        insert(
            conn,
            "frontier",
            id=f"fr-{n:03d}",
            run_id=RUN,
            state_id="st-5",
            action_json=json.dumps({"kind": "click"}),
            safety_class="read",
            status="pending",
            created_at=at(140),
            updated_at=at(140),
        )
    insert(
        conn,
        "checkpoints",
        id="cp-porownanie",
        run_id=RUN,
        state_id="st-5",
        start_url="http://127.0.0.1:4200/porownanie",
        steps_json="[]",
        created_at=at(140),
        updated_at=at(140),
    )
