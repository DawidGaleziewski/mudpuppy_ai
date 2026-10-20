"""The process page's portal-model facts (spec 039 T100, UX-R51–R54, designer screen v2-10)."""

from __future__ import annotations

from .conftest import Store, insert, ts
from .test_chat import text
from .test_processes_pages import P, client, seed


def seed_model(store: Store) -> None:
    conn = store.connect()
    conn.execute(
        "INSERT INTO model_versions (id, portal_id, seq, built_at, algorithm, threshold,"
        " stats_json) VALUES ('mv1', ?, 1, ?, 'minhash-avglink-v1', 0.9, '{}')",
        (P, ts(3)),
    )
    for sid, key, title, state in (
        ("M1", "SC-0001", "Home", "st-home"),
        ("M2", "SC-0002", "Car", "st-car"),
    ):
        conn.execute(
            "INSERT INTO model_screens (id, key, portal_id, route_key, title, status,"
            " first_model_version, created_at) VALUES (?, ?, ?, '/', ?, 'active', 'mv1', ?)",
            (sid, key, P, title, ts(3)),
        )
        conn.execute(
            "INSERT INTO screen_members (screen_id, state_id, ordinal, assigned_by,"
            " from_model_version) VALUES (?, ?, 1, 'clustering', 'mv1')",
            (sid, state),
        )
    conn.execute(
        "INSERT INTO journeys (id, run_id, start_kind, started_at) VALUES"
        " ('j1', 'run-p1', 'entry_url', ?)",
        (ts(2),),
    )
    insert(
        conn,
        "transitions",
        id="t1",
        run_id="run-p1",
        from_state="st-home",
        to_state="st-car",
        journey_id="j1",
        seq=1,
        element_key="link|Samochód",
        kind="click",
        result="ok",
    )
    conn.execute(
        "INSERT INTO process_instances (id, process_id, journey_id, trigger_transition_id,"
        " last_transition_id, outcome, outcome_screen_id, model_version_id)"
        " VALUES ('i1', 'pr-1', 'j1', 't1', 't1', 'completed', 'M2', 'mv1')"
    )
    conn.execute(
        "INSERT INTO process_explorations (id, process_id, epoch_set, depth, random_walks,"
        " new_deviations, completed_at) VALUES ('x1', 'pr-1', '[]', 2, 50, 0, ?)",
        (ts(4),),
    )
    conn.commit()
    conn.close()


def test_the_process_page_shows_triggers_outcomes_and_how_far_it_was_explored(
    empty_store: Store,
) -> None:
    seed(empty_store)
    seed_model(empty_store)
    with client(empty_store) as c:
        body = c.get(f"/processes/PRC-001?portal={P}").text
    flat = text(body)
    assert "In the portal model" in flat
    assert ">SC-0001<" in body and "link|Samochód" in body
    assert "1 completed" in flat
    assert 'data-status="ok">Thorough' in body and "no counterexamples" in flat


def test_without_a_model_the_section_is_left_out(empty_store: Store) -> None:
    seed(empty_store)
    with client(empty_store) as c:
        body = c.get(f"/processes/PRC-001?portal={P}").text
    assert "In the portal model" not in text(body)
