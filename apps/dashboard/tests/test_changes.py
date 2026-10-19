"""What changed (spec 039 M3): deviations of the portal model with their explanations."""

from __future__ import annotations

import sqlite3

from fastapi.testclient import TestClient

from pathfinder_dashboard import queries_changes
from pathfinder_dashboard.app import create_app
from pathfinder_dashboard.settings import Settings

from .conftest import Store, insert, ts

P = "liveinsurer"


def seed(store: Store) -> None:
    conn = store.connect()
    insert(conn, "runs", id="r1", status="completed", started_at=ts(0))
    insert(conn, "states", id="st-a", fingerprint="fp-a", route_template="/", title="Start",
           cluster_id="c", first_seen_run="r1", created_at=ts(0))  # fmt: skip
    for seq in (1, 2):
        conn.execute(
            "INSERT INTO model_versions (id, portal_id, seq, built_at, algorithm, threshold,"
            " stats_json) VALUES (?, ?, ?, ?, 'minhash-avglink-v1', 0.9, '{}')",
            (f"mv{seq}", P, seq, ts(seq)),
        )
    conn.execute(
        "INSERT INTO model_screens (id, key, portal_id, route_key, title, status,"
        " first_model_version, created_at) VALUES ('M1', 'SC-0001', ?, '/', 'Start', 'active',"
        " 'mv1', ?)",
        (P, ts(1)),
    )
    for did, kind, status in (
        ("d1", "new_member", "explained"),
        ("d2", "new_action", "open"),
        ("d3", "result_mismatch", "waiting_test"),
    ):
        conn.execute(
            "INSERT INTO deviations (id, portal_id, model_version_id, kind, subject_key, screen_id,"
            " status, created_at) VALUES (?, ?, 'mv2', ?, ?, 'M1', ?, ?)",
            (did, P, kind, f"{kind}:x", status, ts(2)),
        )
    conn.execute(
        "INSERT INTO hypotheses (id, key, portal_id, kind, claim, claim_json, claim_hash, origin,"
        " rule, derived, confidence, deviation_id, model_version_id, created_at)"
        " VALUES ('h1', 'H-0001', ?, 'structural_drift', 'Screen SC-0001 changed with a new"
        " release.', '{}', ?, 'rule', 'R2', 1, 'inferred', 'd1', 'mv2', ?)",
        (P, "a" * 64, ts(2)),
    )
    conn.execute(
        "INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason,"
        " at) VALUES ('he1', 'h1', NULL, 'confirmed', 'reconciler', 'derived by rule R2', ?)",
        (ts(2),),
    )
    conn.commit()
    conn.close()


def view(store: Store) -> queries_changes.ChangesView:
    conn = store.connect()
    conn.row_factory = sqlite3.Row
    try:
        return queries_changes.changes_view(conn, P)
    finally:
        conn.close()


def test_changes_are_split_by_who_has_to_act(empty_store: Store) -> None:
    seed(empty_store)
    v = view(empty_store)
    assert v.latest_seq == 2
    assert [c.kind for c in v.explained] == ["new_member"]
    assert v.explained[0].hypothesis_key == "H-0001" and v.explained[0].rule == "R2"
    assert [c.kind for c in v.needs_you] == ["new_action"]
    assert [c.kind for c in v.waiting] == ["result_mismatch"]


def test_the_page_lists_changes_with_plain_words_and_statuses(empty_store: Store) -> None:
    seed(empty_store)
    settings = Settings(data_dir=empty_store.data_dir, default_env=empty_store.env)
    client = TestClient(create_app(settings))
    html = client.get(f"/changes?portal={P}").text
    assert '<h1 class="sy-h1">What changed</h1>' in html
    assert "Screen looks different" in html and "Explained automatically" in html
    assert 'data-status="needs">Needs you' in html
    assert ">H-0001<" in html
    assert html.count("sy-btn--primary") <= 1


def seed_rule_and_rename(store: Store) -> None:
    """A rename's new button explained by another change, and a supported decision rule."""
    conn = store.connect()
    conn.execute(
        "INSERT INTO deviations (id, portal_id, model_version_id, kind, subject_key, screen_id,"
        " status, created_at) VALUES ('d4', ?, 'mv2', 'new_action', 'new_action:y', 'M1',"
        " 'explained', ?)",
        (P, ts(2)),
    )
    claim = '{"decisionPoint": {"screen": "SC-0001", "action": "button|dalej||"}, "rows": 11}'
    conn.execute(
        "INSERT INTO hypotheses (id, key, portal_id, kind, claim, claim_json, claim_hash, origin,"
        " rule, derived, confidence, fitness, model_version_id, created_at)"
        " VALUES ('h2', 'H-0002', ?, 'decision_rule', 'Drivers under 18 are refused.', ?, ?,"
        " 'rule', 'R7', 0, 'needs_confirmation', 1.0, 'mv2', ?)",
        (P, claim, "b" * 64, ts(2)),
    )
    for i, (to, reason) in enumerate(
        (("proposed", "mined from 11 executions"), ("testing", "replays"),
         ("supported", "3 boundary test(s) gave the predicted outcome"))
    ):  # fmt: skip
        conn.execute(
            "INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor,"
            " reason, at) VALUES (?, 'h2', NULL, ?, 'replay', ?, ?)",
            (f"he2{i}", to, reason, ts(3 + i)),
        )
    for i, verdict in enumerate(("pass", "pass", None)):
        conn.execute(
            "INSERT INTO hypothesis_tests (id, hypothesis_id, inputs_json, refutes_if_json,"
            " verdict, created_at) VALUES (?, 'h2', '{}', '{}', ?, ?)",
            (f"t{i}", verdict, ts(3)),
        )
    conn.commit()
    conn.close()


def test_a_change_another_one_explains_is_not_for_a_person(empty_store: Store) -> None:
    seed(empty_store)
    seed_rule_and_rename(empty_store)
    v = view(empty_store)
    assert sorted(c.kind for c in v.explained) == ["new_action", "new_member"]
    assert [c.kind for c in v.needs_you] == ["new_action"]


def test_decision_rules_show_their_status_and_boundary_verdicts(empty_store: Store) -> None:
    seed(empty_store)
    seed_rule_and_rename(empty_store)
    (rule,) = view(empty_store).rules
    assert (rule.key, rule.status, rule.screen_key) == ("H-0002", "supported", "SC-0001")
    assert (rule.passed, rule.failed, rule.inconclusive, rule.untested) == (2, 0, 0, 1)
    assert rule.rows == 11
    settings = Settings(data_dir=empty_store.data_dir, default_env=empty_store.env)
    html = TestClient(create_app(settings)).get(f"/changes?portal={P}").text
    assert "Decision rules" in html and ">H-0002<" in html
    assert 'data-status="inferred">Supported' in html
    assert "Part of another change that a rule explained" in html


def test_without_a_model_the_page_says_how_to_build_one(empty_store: Store) -> None:
    settings = Settings(data_dir=empty_store.data_dir, default_env=empty_store.env)
    html = TestClient(create_app(settings)).get(f"/changes?portal={P}").text
    assert "has no portal model yet" in html
