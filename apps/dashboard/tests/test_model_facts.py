"""The process page's portal-model facts (spec 039 T100, UX-R51–R54, designer screen v2-10)."""

from __future__ import annotations

import json

from .conftest import Store, insert, ts
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
        "INSERT INTO process_instances (id, process_id, journey_id, trigger_kind,"
        " trigger_transition_id, last_transition_id, outcome, outcome_screen_id, model_version_id,"
        " screens_json)"
        " VALUES ('i1', 'pr-1', 'j1', 'transition', 't1', 't1', 'completed', 'M2', 'mv1',"
        ' \'["M1","M2"]\')'
    )
    # A second journey opened the calculator by URL (a deep link, owner answer 10).
    conn.execute(
        "INSERT INTO journeys (id, run_id, start_kind, started_at) VALUES"
        " ('j2', 'run-p1', 'entry_url', ?)",
        (ts(3),),
    )
    conn.execute(
        "INSERT INTO observations (id, run_id, state_id, via, url, created_at, journey_id, seq)"
        " VALUES ('o2', 'run-p1', 'st-car', 'navigate', 'https://example.test/car', ?, 'j2', 9)",
        (ts(3),),
    )
    conn.execute(
        "INSERT INTO process_instances (id, process_id, journey_id, trigger_kind,"
        " trigger_observation_id, outcome, outcome_screen_id, model_version_id, screens_json)"
        " VALUES ('i2', 'pr-1', 'j2', 'deep_link', 'o2', 'incomplete', 'M2', 'mv1', '[\"M2\"]')"
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
        facts = c.get(f"/api/portals/{P}/processes/PRC-001").json()["facts"]
    flat = json.dumps(facts, ensure_ascii=False)
    assert "SC-0001" in flat and "link|Samochód" in flat
    assert "1 completed" in flat and "1 incomplete" in flat
    assert "A URL opened on the first screen (deep link)" in flat
    assert facts["explored"]["word"] == "Thorough" and "no counterexamples" in flat
    # Paths (v2-10, T079): the walked screens of each instance, grouped
    assert len(facts["paths"]) == 2
    assert flat.index('"Home"') < flat.index('"Car"')


def test_without_a_model_the_section_is_left_out(empty_store: Store) -> None:
    seed(empty_store)
    with client(empty_store) as c:
        body = c.get(f"/api/portals/{P}/processes/PRC-001").json()
    assert body["facts"] is None
