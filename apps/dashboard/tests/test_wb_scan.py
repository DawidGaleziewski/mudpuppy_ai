"""Workbench data lane (spec 043 T013, D-3): the designer's fixture scan derived from the store."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from mudpuppy_dashboard import queries_wb_scan as q

from .conftest import insert, make_store
from .wb_fixture import RUN, STOP_ERROR, seed_wb_scan


def _conn(tmp_path: Path, *, stopped: bool = True) -> sqlite3.Connection:
    conn = sqlite3.connect(make_store(tmp_path))
    conn.row_factory = sqlite3.Row
    seed_wb_scan(conn, stopped=stopped)
    conn.commit()
    return conn


def test_one_event_per_step_and_the_stop_is_step_171(tmp_path: Path) -> None:
    events = q.scan_events(_conn(tmp_path), RUN)
    assert [e.step for e in events] == list(range(1, 172))
    assert events[0].type == "scan.started"
    assert events[169].type == "action.failed"
    assert events[169].error == STOP_ERROR
    assert events[-1].type == "scan.stopped"
    assert events[-1].ref(RUN) == "01a110d5#171"


def test_six_route_pages_with_side_trips_folded(tmp_path: Path) -> None:
    live = q.scan_live(_conn(tmp_path), RUN)
    assert live is not None
    assert [(p.route, p.state, p.step) for p in live.route_pages] == [
        ("/", 1, 12),
        ("/ubezpieczenia/samochod", 1, 38),
        ("/kalkulator/kierowca", 1, 77),
        ("/kalkulator/kierowca", 2, 102),
        ("/porownanie", 1, 140),
        ("/kontakt", 1, 167),
    ]
    assert [p.side_pages for p in live.route_pages] == [2, 2, 2, 1, 2, 2]
    assert [p.pages_so_far for p in live.route_pages] == [1, 4, 7, 10, 12, 15]
    assert (live.pages, live.queued, live.steps) == (17, 113, 171)


def test_a_stopped_scan_names_where_and_why(tmp_path: Path) -> None:
    live = q.scan_live(_conn(tmp_path), RUN)
    assert live is not None
    assert live.status == "stopped"
    assert live.failed_at is not None and live.failed_at.route == "/kontakt"
    assert live.stop_reason == STOP_ERROR
    assert live.checkpoint == "/porownanie"


def test_a_running_scan_has_no_end_event_and_the_crawler_is_on_its_last_page(
    tmp_path: Path,
) -> None:
    live = q.scan_live(_conn(tmp_path, stopped=False), RUN)
    assert live is not None
    assert live.status == "running"
    assert live.events[-1].type == "page.visited"
    assert live.here is not None and live.here.route == "/kontakt"
    assert live.failed_at is None


def test_a_short_id_resolves_to_the_bound_run_first(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    twin = "01a110d5-ffff-7000-8000-000000000002"
    insert(
        conn, "runs", id=twin, portal_id="reference-insurer", started_at="2026-10-07T00:00:00.000Z"
    )
    assert q.resolve_scan(conn, "reference-insurer", "01a110d5") == twin  # the newest
    assert q.resolve_scan(conn, "reference-insurer", "01a110d5", prefer=[RUN]) == RUN
    assert q.resolve_scan(conn, "reference-insurer", "../../etc") is None
    assert q.resolve_scan(conn, "other-portal", "01a110d5") is None
    assert q.unique_shorts([RUN, twin, "01a2aaaa-0000"]) == ["01a2aaaa-0000"]


def test_an_unknown_run_has_no_events(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    assert q.scan_events(conn, "nope") == []
    assert q.scan_live(conn, "nope") is None
