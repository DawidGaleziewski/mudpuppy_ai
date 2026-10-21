"""Business rules (spec 039 T100, UX-R60–R63, designer screens v2-11 / v2-12)."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from pathfinder_dashboard.app import create_app
from pathfinder_dashboard.settings import Settings

from .conftest import Store, add_record, add_session, ts
from .test_changes import P, seed, seed_rule_and_rename


def seed_table_rule(store: Store) -> None:
    """A mined rule with its decision table and two judged boundary tests (H-0003)."""
    conn = store.connect()
    age = "derived.input.data_urodzenia.age_years"
    claim = {
        "decisionPoint": {"screen": "SC-0001", "action": "button|dalej||"},
        "hitPolicy": "U",
        "inputs": [{"name": age, "type": "number"}],
        "outputs": [{"name": "next", "type": "screen"}],
        "rules": [
            {"when": {age: "< 18"}, "then": "SC-0002 ok"},
            {"when": {age: ">= 18"}, "then": "SC-0003 ok"},
        ],
        "fitness": 1,
        "precision": 1,
        "rows": 11,
    }
    conn.execute(
        "INSERT INTO hypotheses (id, key, portal_id, kind, claim, claim_json, claim_hash, origin,"
        " rule, derived, confidence, fitness, model_version_id, created_at)"
        " VALUES ('h3', 'H-0003', ?, 'decision_rule', 'A business rule decides where Dalej leads.',"
        " ?, ?, 'rule', 'R7', 0, 'needs_confirmation', 1.0, 'mv2', ?)",
        (P, json.dumps(claim), "c" * 64, ts(2)),
    )
    conn.execute(
        "INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason,"
        " at) VALUES ('he31', 'h3', NULL, 'proposed', 'miner', 'mined from 11 executions', ?)",
        (ts(3),),
    )
    conn.execute(
        "INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason,"
        " at) VALUES ('he32', 'h3', 'proposed', 'refuted', 'Anna', 'Wrong threshold.', ?)",
        (ts(4),),
    )
    for i, (inp, verdict, got) in enumerate(
        ((17, "pass", "SC-0002 ok"), (18, "fail", "SC-0002 ok"))
    ):
        conn.execute(
            "INSERT INTO hypothesis_tests (id, hypothesis_id, inputs_json, refutes_if_json,"
            " result_json, verdict, created_at) VALUES (?, 'h3', ?, ?, ?, ?, ?)",
            (
                f"t3{i}",
                json.dumps({age: inp}),
                json.dumps({"notIn": ["SC-0002 ok" if inp < 18 else "SC-0003 ok"]}),
                json.dumps({"outcome": got}),
                verdict,
                ts(3),
            ),
        )
    conn.commit()
    conn.close()


def client(store: Store) -> TestClient:
    return TestClient(create_app(Settings(data_dir=store.data_dir, default_env=store.env)))


def test_the_rules_list_groups_rules_by_what_needs_a_person(empty_store: Store) -> None:
    seed(empty_store)
    seed_rule_and_rename(empty_store)
    seed_table_rule(empty_store)
    html = client(empty_store).get(f"/rules?portal={P}").text
    assert '<h1 class="sy-h1">Business rules</h1>' in html
    # Broken (the refuted H-0003) comes before Tested (the supported H-0002).
    assert html.index("Broken · 1") < html.index("Tested · 1")
    assert ">H-0002<" in html and ">H-0003<" in html
    assert 'data-status="failed">Broken' in html
    only = client(empty_store).get(f"/rules?portal={P}&status=tested").text
    assert ">H-0002<" in only and ">H-0003<" not in only
    assert html.count("sy-btn--primary") <= 1


def test_a_rule_shows_its_decision_table_tests_and_history(empty_store: Store) -> None:
    seed(empty_store)
    seed_table_rule(empty_store)
    html = client(empty_store).get(f"/rules/H-0003?portal={P}").text
    assert "sy-table--decision" in html
    assert '<code class="sy-dt-cond">&lt; 18</code>' in html
    assert ">SC-0003<" in html
    assert 'data-status="failed">Fail' in html and 'data-status="ok">Pass' in html
    assert "First match" in html
    assert "Wrong threshold." in html and "sy-note" in html  # a person's reason
    missing = client(empty_store).get(f"/rules/H-0404?portal={P}")
    assert missing.status_code == 404 and "Rule not found" in missing.text


def test_a_documented_rule_goes_by_its_business_rule_key(empty_store: Store) -> None:
    """Owner answer 18 (b): the BA's business rule record citing the hypothesis gives the rule its
    BR key; the H key still opens it, and the record links back to the rule."""
    seed(empty_store)
    seed_table_rule(empty_store)
    conn = empty_store.connect()
    add_session(conn, "sess-1", portal=P)
    add_record(
        conn,
        "BR-009",
        "Drivers under 18 cannot buy",
        [{"evidence": [("hypothesis", "h3", None, "the mined rule")]}],
        portal=P,
    )
    conn.commit()
    conn.close()
    listed = client(empty_store).get(f"/rules?portal={P}").text
    assert ">BR-009<" in listed and ">H-0003<" not in listed
    by_br = client(empty_store).get(f"/rules/BR-009?portal={P}").text
    by_h = client(empty_store).get(f"/rules/H-0003?portal={P}").text
    for page in (by_br, by_h):
        assert "Documented as" in page and ">BR-009<" in page and ">H-0003<" in page
    record = client(empty_store).get(f"/docs/{P}/BR-009").text
    assert 'href="/rules/H-0003' in record


def test_the_nav_is_grouped_and_has_changes_and_rules(empty_store: Store) -> None:
    seed(empty_store)
    html = client(empty_store).get(f"/rules?portal={P}").text
    assert 'class="sy-nav__group" aria-hidden="true">Portal model' in html
    assert 'class="sy-nav__group" aria-hidden="true">Machine' in html
    assert 'href="/changes' in html and 'aria-current="page">Rules' in html
