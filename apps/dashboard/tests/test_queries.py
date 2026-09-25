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
