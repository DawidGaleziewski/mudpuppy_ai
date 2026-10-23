"""What changed (spec 039 T100, designer screens v2-02 / v2-03): the portal model's changes in a
range of model versions, grouped by process and screen, with explanations; one change's Before /
after."""

from __future__ import annotations

import json
import sqlite3

from fastapi.testclient import TestClient

from mudpuppy_dashboard import queries_changes
from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

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


def seed_process_and_releases(store: Store) -> None:
    """SC-0001 is walked by PRC-001; the shell had two releases, the second overlapping."""
    conn = store.connect()
    insert(conn, "states", id="st-b", fingerprint="fp-b", route_template="/", title="Start (new)",
           cluster_id="c", first_seen_run="r1", created_at=ts(1))  # fmt: skip
    for state, n in (("st-a", 1), ("st-b", 2)):
        conn.execute(
            "INSERT INTO screen_members (screen_id, state_id, ordinal, assigned_by,"
            " from_model_version) VALUES ('M1', ?, ?, 'clustering', 'mv1')",
            (state, n),
        )
    conn.execute("UPDATE deviations SET state_id = 'st-b' WHERE id = 'd1'")
    conn.execute(
        "INSERT INTO ba_processes (id, portal_id, key, name, persona, stage, rev, source,"
        " created_at, updated_at) VALUES ('p1', ?, 'PRC-001', 'Oblicz składkę', 'guest',"
        " 'as_is_documented', 1, 'new', ?, ?)",
        (P, ts(0), ts(0)),
    )
    conn.execute(
        "INSERT INTO process_models (id, process_id, label, kind, rev, created_at)"
        " VALUES ('pm1', 'p1', 'A', 'as_is', 1, ?)",
        (ts(0),),
    )
    conn.execute(
        "INSERT INTO process_model_revisions (model_id, rev, change, author, steps, created_at)"
        " VALUES ('pm1', 1, 'create', 'Anna', ?, ?)",
        (json.dumps([{"state_id": "st-a"}]), ts(0)),
    )
    for i, (state, at) in enumerate((("st-a", ts(0)), ("st-a", ts(5)), ("st-b", ts(6)),
                                     ("st-b", ts(9)))):  # fmt: skip
        conn.execute(
            "INSERT INTO observations (id, run_id, state_id, via, url, created_at)"
            " VALUES (?, 'r1', ?, 'navigate', 'https://example.test/', ?)",
            (f"o{i}", state, at),
        )
    for bid, sig, first, last, overlaps in (
        ("b1", "marker:1d77", "o0", "o1", 0),
        ("b2", "marker:3e1a", "o2", "o3", 1),
    ):
        conn.execute(
            "INSERT INTO builds (id, portal_id, scope, signature, source, assets_json, first_seen)"
            " VALUES (?, ?, 'shell', ?, 'marker', '[]', ?)",
            (bid, P, sig, ts(0)),
        )
        conn.execute(
            "INSERT INTO build_epochs (id, portal_id, scope, environment, build_id,"
            " first_observation_id, last_observation_id, overlaps_previous, model_version_id)"
            " VALUES (?, ?, 'shell', 'production', ?, ?, ?, ?, 'mv2')",
            (f"e{bid}", P, bid, first, last, overlaps),
        )
    conn.execute("INSERT INTO observation_builds VALUES ('o1', 'b1'), ('o3', 'b2')")
    conn.commit()
    conn.close()


def view(store: Store, **kw: object) -> queries_changes.ChangesView:
    conn = store.connect()
    conn.row_factory = sqlite3.Row
    try:
        return queries_changes.changes_view(conn, P, queries_changes.ChangeFilter(**kw))  # type: ignore[arg-type]
    finally:
        conn.close()


def client(store: Store) -> TestClient:
    return TestClient(create_app(Settings(data_dir=store.data_dir, default_env=store.env)))


def test_changes_are_split_by_who_has_to_act(empty_store: Store) -> None:
    seed(empty_store)
    v = view(empty_store)
    assert v.latest_seq == 2
    assert v.counts == {"all": 3, "needs": 2, "explained": 1, "waiting": 1}
    by_kind = {c.kind: c for c in v.all_changes()}
    assert by_kind["new_member"].status == "explained"
    assert by_kind["new_member"].explanation.word == "Release"
    assert by_kind["new_action"].status == "open"
    assert by_kind["new_action"].explanation.word == "Unexplained"
    assert by_kind["result_mismatch"].status == "waiting_test"
    # Needs you comes first in its screen group.
    assert [c.status for c in v.groups[0].screens[0].changes][-1] == "explained"


def test_a_change_another_one_explains_is_part_of_a_rename(empty_store: Store) -> None:
    seed(empty_store)
    seed_rule_and_rename(empty_store)
    v = view(empty_store)
    (d4,) = [c for c in v.all_changes() if c.id == "d4"]
    assert d4.status == "explained" and d4.explanation.word == "Part of a rename"


def test_filters_and_the_range_narrow_the_list(empty_store: Store) -> None:
    seed(empty_store)
    assert [c.kind for c in view(empty_store, show="explained").all_changes()] == ["new_member"]
    assert {c.kind for c in view(empty_store, show="needs").all_changes()} == {
        "new_action", "result_mismatch"}  # fmt: skip
    assert [c.id for c in view(empty_store, kind="new_action").all_changes()] == ["d2"]
    assert view(empty_store, from_seq=2).all_changes() == []
    assert len(view(empty_store, from_seq=1).all_changes()) == 3


def test_changes_group_under_the_process_that_walks_the_screen(empty_store: Store) -> None:
    seed(empty_store)
    seed_process_and_releases(empty_store)
    v = view(empty_store)
    assert [g.key for g in v.groups] == ["PRC-001"]
    assert v.processes == [("PRC-001", "Oblicz składkę", 3)]
    assert view(empty_store, process="none").all_changes() == []


def test_from_is_the_previous_release_a_date_or_a_scan(empty_store: Store) -> None:
    """Spec 040 FR-002 (12-v2-ux § 2): by default since the previous release; From can be a
    date or a scan."""
    seed(empty_store)
    conn = empty_store.connect()
    conn.row_factory = sqlite3.Row
    assert queries_changes.range_from(conn, P) == (0, "first")  # no release told apart yet
    conn.close()
    seed_process_and_releases(empty_store)
    conn = empty_store.connect()
    conn.row_factory = sqlite3.Row
    assert queries_changes.range_from(conn, P) == (1, "release")  # version 2 brought them
    assert queries_changes.range_from(conn, P, from_date=ts(3)) == (2, "date")
    assert queries_changes.range_from(conn, P, from_scan="r1") == (0, "scan")
    assert queries_changes.range_from(conn, P, from_seq=2) == (2, "version")
    conn.close()


SHOT_A, SHOT_B, LAYOUT = "a" * 64 + ".png", "b" * 64 + ".png", "c" * 64 + ".json"


def seed_new_button(store: Store) -> None:
    """d7: a new button on SC-0001, waiting for a person (H-0007); both variants have a
    screenshot, the new one a layout with the button's box."""
    seed(store)
    seed_process_and_releases(store)
    evidence = store.data_dir / "evidence"
    evidence.mkdir(parents=True, exist_ok=True)
    layout = {
        "version": 1,
        "viewport": {"width": 1000, "height": 500},
        "page": {"width": 1000, "height": 500},
        "cut": False,
        "elements": [
            {"key": "button|dalej||", "role": "button", "name": "Dalej",
             "box": {"x": 100, "y": 50, "width": 200, "height": 25}}
        ],
    }  # fmt: skip
    (evidence / LAYOUT).write_text(json.dumps(layout), encoding="utf-8")
    conn = store.connect()
    conn.execute("UPDATE states SET screenshot_ref = ? WHERE id = 'st-a'", (SHOT_A,))
    conn.execute(
        "UPDATE states SET screenshot_ref = ?, layout_ref = ? WHERE id = 'st-b'", (SHOT_B, LAYOUT)
    )
    conn.execute(
        "INSERT INTO action_classes (id, screen_id, element_key, kind, status,"
        " status_model_version) VALUES ('a7', 'M1', 'button|dalej||', 'click', 'untested', 'mv2')"
    )
    conn.execute(
        "INSERT INTO deviations (id, portal_id, model_version_id, kind, subject_key, screen_id,"
        " action_class_id, status, created_at) VALUES ('d7', ?, 'mv2', 'new_action',"
        " 'new_action:dalej', 'M1', 'a7', 'open', ?)",
        (P, ts(2)),
    )
    conn.execute(
        "INSERT INTO hypotheses (id, key, portal_id, kind, claim, claim_json, claim_hash, origin,"
        " rule, derived, confidence, deviation_id, model_version_id, created_at)"
        " VALUES ('h7', 'H-0007', ?, 'nondeterministic', 'Dalej appeared without a release.',"
        " '{}', ?, 'rule', 'R5', 0, 'needs_confirmation', 'd7', 'mv2', ?)",
        (P, "7" * 64, ts(2)),
    )
    conn.execute(
        "INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason,"
        " at) VALUES ('he7', 'h7', NULL, 'proposed', 'reconciler', 'R5', ?)",
        (ts(2),),
    )
    conn.commit()
    conn.close()
