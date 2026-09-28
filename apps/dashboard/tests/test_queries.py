"""SC-002: every count the dashboard shows equals a direct query of the store."""

import sqlite3

import pytest

from pathfinder_dashboard import db, queries

from .conftest import BIG_RUN, CAPTCHA_1, DECISION_MIX, FRONTIER_MIX, Store, insert, ts


@pytest.fixture
def conn(liveinsurer_store: Store) -> sqlite3.Connection:
    return db.connect(liveinsurer_store.data_dir, liveinsurer_store.env)


def scalar(conn: sqlite3.Connection, sql: str, *args: object) -> int:
    return conn.execute(sql, args).fetchone()[0]


# --- US1: overview and runs list --------------------------------------------------------------


def test_portal_summary_matches_direct_sql(conn: sqlite3.Connection) -> None:
    [summary] = queries.portal_summaries(conn)
    assert summary.portal_id == "liveinsurer"
    assert summary.runs_by_status == {"interrupted": 7, "stopped_warning": 2}
    assert summary.runs == 9
    assert summary.states == scalar(conn, "SELECT count(*) FROM states")
    assert summary.actions_allowed == scalar(conn, "SELECT count(*) FROM actions WHERE allowed")
    assert summary.actions_skipped == 30
    assert summary.forms == 6
    assert summary.network_calls == 9
    assert summary.open_questions_open == 0
    assert summary.rule_candidates == 0
    assert summary.last_run_at == ts(45)


def test_portal_summaries_are_per_portal(liveinsurer_store: Store) -> None:
    w = liveinsurer_store.connect()
    insert(w, "runs", id="other-1", portal_id="demo", status="completed", started_at=ts(100))
    insert(w, "open_questions", id="q1", run_id="other-1", text="Why?")
    w.commit()
    conn = db.connect(liveinsurer_store.data_dir, liveinsurer_store.env)
    by_portal = {s.portal_id: s for s in queries.portal_summaries(conn)}
    assert set(by_portal) == {"liveinsurer", "demo"}
    assert by_portal["demo"].runs_by_status == {"completed": 1}
    assert by_portal["demo"].open_questions_open == 1
    assert by_portal["demo"].states == 0
    assert by_portal["liveinsurer"].open_questions_open == 0
    assert queries.portals(conn) == ["demo", "liveinsurer"]


def test_list_runs_newest_first_with_duration(conn: sqlite3.Connection) -> None:
    page = queries.list_runs(conn)
    assert page.total == 9
    assert [i.run.id for i in page.items] == [f"run-{n:03d}" for n in range(9, 0, -1)]
    assert all(i.duration_ms == 120_000 for i in page.items)
    assert page.next_cursor is None


def test_list_runs_filters(conn: sqlite3.Connection) -> None:
    stopped = queries.list_runs(conn, status="stopped_warning")
    assert stopped.total == 2
    assert {i.run.warning for i in stopped.items} >= {CAPTCHA_1}
    assert queries.list_runs(conn, portal="nope").items == []
    assert queries.list_runs(conn, portal="liveinsurer").total == 9


def test_list_runs_keyset_pagination(conn: sqlite3.Connection) -> None:
    first = queries.list_runs(conn, limit=4)
    assert len(first.items) == 4 and first.next_cursor
    second = queries.list_runs(conn, limit=4, cursor=first.next_cursor)
    third = queries.list_runs(conn, limit=4, cursor=second.next_cursor)
    ids = [i.run.id for p in (first, second, third) for i in p.items]
    assert ids == [f"run-{n:03d}" for n in range(9, 0, -1)]
    assert third.next_cursor is None


def test_running_run_duration_uses_elapsed(liveinsurer_store: Store) -> None:
    w = liveinsurer_store.connect()
    insert(w, "runs", id="run-live", status="running", elapsed_ms=4321, started_at=ts(200))
    w.commit()
    conn = db.connect(liveinsurer_store.data_dir, liveinsurer_store.env)
    top = queries.list_runs(conn, limit=1).items[0]
    assert top.run.id == "run-live" and top.duration_ms == 4321


def test_empty_store(empty_store: Store) -> None:
    conn = db.connect(empty_store.data_dir, empty_store.env)
    assert queries.portal_summaries(conn) == []
    assert queries.list_runs(conn).items == []
    assert queries.get_run(conn, "x") is None
    assert queries.run_summary(conn, "x") is None


# --- US2: run detail --------------------------------------------------------------------------


def test_run_summary_counts(conn: sqlite3.Connection) -> None:
    s = queries.run_summary(conn, BIG_RUN)
    assert s is not None
    assert s.states == 1
    assert s.actions == 600
    assert s.frontier == 600
    assert s.frontier_by_status == FRONTIER_MIX
    assert s.forms == 6 and s.network_calls == 9 and s.edges == 2
    assert s.robots_policies == scalar(
        conn, "SELECT count(*) FROM robots_policies WHERE run_id = ?", BIG_RUN
    )
    assert s.decisions == sum(c for _, _, c, _ in DECISION_MIX)
    assert s.decisions_by_kind == {"skip": 39, "refuse": 10, "merge": 4, "split": 1}


def test_run_summary_other_run(conn: sqlite3.Connection) -> None:
    s = queries.run_summary(conn, "run-005")
    assert s is not None
    assert s.run.status == "stopped_warning" and s.run.warning == CAPTCHA_1
    assert s.actions == 0 and s.decisions_by_kind == {"warning": 1}


def test_run_states_carry_confidence_and_evidence(conn: sqlite3.Connection) -> None:
    [observed] = queries.run_states(conn, BIG_RUN)
    assert observed.state.title == "Kup ubezpieczenia"
    assert observed.state.confidence == "observed"
    assert observed.state.evidence_ref.endswith(".json")
    assert observed.observation.evidence_ref
    assert queries.run_states(conn, "run-001") == []


def test_run_actions_filters_and_pages(conn: sqlite3.Connection) -> None:
    page = queries.run_actions(conn, BIG_RUN, limit=50)
    assert page.total == 600 and len(page.items) == 50 and page.next_cursor
    nxt = queries.run_actions(conn, BIG_RUN, limit=50, cursor=page.next_cursor)
    assert nxt.items[0].id > page.items[-1].id
    skipped = queries.run_actions(conn, BIG_RUN, allowed=False)
    assert skipped.total == 30
    assert all(a.safety_class == "mutating" and a.skip_reason for a in skipped.items)
    assert queries.run_actions(conn, BIG_RUN, safety_class="read").total == 570
    assert queries.action_counts(conn, BIG_RUN) == {("read", True): 570, ("mutating", False): 30}


def test_run_frontier(conn: sqlite3.Connection) -> None:
    assert queries.frontier_counts(conn, BIG_RUN) == FRONTIER_MIX
    unreachable = queries.run_frontier(conn, BIG_RUN, status="unreachable")
    assert unreachable.total == 10 and all(f.reason for f in unreachable.items)
    everything = queries.run_frontier(conn, BIG_RUN, limit=1000)
    assert everything.total == 600 and everything.next_cursor is None


def test_forms_network_robots(conn: sqlite3.Connection) -> None:
    forms = queries.run_forms(conn, BIG_RUN)
    assert len(forms) == 6
    assert forms[0].fields_json == [{"name": "q", "type": "search", "required": False}]
    assert queries.run_network_calls(conn, BIG_RUN).total == 9
    robots = queries.run_robots_policies(conn, "run-001")
    assert [r.id for r in robots] == ["rob-00", "rob-09"]


def test_decision_groups_and_filters(conn: sqlite3.Connection) -> None:
    groups = queries.decision_groups(conn, BIG_RUN)
    assert [(g.kind, g.rule, g.count) for g in groups] == [(k, r, c) for k, r, c, _ in DECISION_MIX]
    assert groups[0].example_reason == DECISION_MIX[0][3]
    assert queries.run_decisions(conn, BIG_RUN, kind="skip").total == 39
    by_rule = queries.run_decisions(conn, BIG_RUN, rule="robots:Disallow: *cHash*")
    assert by_rule.total == 6
    assert queries.run_decisions(conn, BIG_RUN, kind="merge", rule="ceiling:read").total == 0
    assert queries.decision_rules(conn, BIG_RUN)[0] == "ceiling:read"


def test_invalid_json_is_returned_raw(liveinsurer_store: Store) -> None:
    w = liveinsurer_store.connect()
    # json_valid() CHECKs stop invalid JSON at write time; a shape the UI does not expect
    # (a bare string, a nested list) must still come back unchanged.
    insert(
        w,
        "decision_log",
        id="dec-odd",
        run_id="run-001",
        kind="note",
        reason="odd",
        detail_json='"just a string"',
    )
    w.commit()
    conn = db.connect(liveinsurer_store.data_dir, liveinsurer_store.env)
    [entry] = queries.run_decisions(conn, "run-001", kind="note").items
    assert entry.detail_json == "just a string"


def test_get_run(conn: sqlite3.Connection) -> None:
    run = queries.get_run(conn, BIG_RUN)
    assert run is not None and run.steps_used == 3
    assert run.config_snapshot == {"portal": {"id": "liveinsurer"}}
    assert queries.get_run(conn, "missing") is None


# --- trace (US1/US2) --------------------------------------------------------------------------


def seed_trace(conn: sqlite3.Connection) -> None:
    insert(conn, "trace_boots", id="boot-1", started_at=ts(0))
    insert(
        conn,
        "trace_spans",
        id="call-1",
        boot_id="boot-1",
        seq=1,
        run_id=BIG_RUN,
        name="navigate",
        status="ok",
        started_at=ts(0),
        duration_ms=100,
    )
    insert(
        conn,
        "trace_spans",
        id="call-2",
        boot_id="boot-1",
        seq=2,
        run_id=BIG_RUN,
        name="act",
        status="error",
        started_at=ts(1),
        duration_ms=50,
    )
    insert(
        conn,
        "trace_spans",
        id="call-3",
        boot_id="boot-1",
        seq=3,
        run_id=BIG_RUN,
        name="navigate",
        status="ok",
        started_at=ts(2),
        duration_ms=200,
    )
    insert(
        conn,
        "trace_spans",
        id="ev-1",
        boot_id="boot-1",
        seq=4,
        run_id=BIG_RUN,
        parent_id="call-3",
        kind="event",
        name="stabilization_timeout",
        status="ok",
        started_at=ts(2),
        duration_ms=None,
    )
    insert(
        conn,
        "trace_spans",
        id="phase-1",
        boot_id="boot-1",
        seq=5,
        run_id=BIG_RUN,
        parent_id="call-3",
        kind="phase",
        name="settle",
        status="ok",
        started_at=ts(2),
        duration_ms=150,
    )
    insert(
        conn,
        "trace_spans",
        id="run-less-1",
        boot_id="boot-1",
        seq=6,
        run_id=None,
        name="start_run",
        status="error",
        started_at=ts(3),
        duration_ms=5,
    )


@pytest.fixture
def trace_conn(liveinsurer_store: Store) -> sqlite3.Connection:
    w = liveinsurer_store.connect()
    seed_trace(w)
    w.commit()
    w.close()
    return db.connect(liveinsurer_store.data_dir, liveinsurer_store.env)


def test_trace_calls_ordered_by_boot_then_seq(trace_conn: sqlite3.Connection) -> None:
    page = queries.trace_calls(trace_conn, BIG_RUN)
    assert [s.id for s in page.items] == ["call-1", "call-2", "call-3"]
    assert page.total == 3


def test_trace_calls_filters_tools_and_statuses(trace_conn: sqlite3.Connection) -> None:
    assert [s.id for s in queries.trace_calls(trace_conn, BIG_RUN, tools=["act"]).items] == [
        "call-2"
    ]
    assert [
        s.id for s in queries.trace_calls(trace_conn, BIG_RUN, statuses=["error"]).items
    ] == ["call-2"]


def test_trace_calls_problems_filter(trace_conn: sqlite3.Connection) -> None:
    problems = {s.id for s in queries.trace_calls(trace_conn, BIG_RUN, problems=True).items}
    # call-2 errored; call-3 has a stabilization_timeout child
    assert problems == {"call-2", "call-3"}


def test_trace_calls_pagination(trace_conn: sqlite3.Connection) -> None:
    first = queries.trace_calls(trace_conn, BIG_RUN, limit=2)
    assert [s.id for s in first.items] == ["call-1", "call-2"]
    assert first.next_cursor
    second = queries.trace_calls(trace_conn, BIG_RUN, limit=2, cursor=first.next_cursor)
    assert [s.id for s in second.items] == ["call-3"]
    assert second.next_cursor is None


def test_span_children_filters(trace_conn: sqlite3.Connection) -> None:
    children = queries.span_children(trace_conn, "call-3")
    assert {c.id for c in children} == {"ev-1", "phase-1"}
    assert [c.id for c in queries.span_children(trace_conn, "call-3", kinds=["phase"])] == [
        "phase-1"
    ]
    assert [c.id for c in queries.span_children(trace_conn, "call-3", names=["settle"])] == [
        "phase-1"
    ]
    assert queries.span_children(trace_conn, "call-1") == []


def test_server_activity_lists_run_less_calls(trace_conn: sqlite3.Connection) -> None:
    page = queries.server_activity(trace_conn)
    assert [s.id for s in page.items] == ["run-less-1"]
    assert page.total == 1
