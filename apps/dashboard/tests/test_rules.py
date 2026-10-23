"""Business rules (spec 039 T100): the decision-table seed and client the Rules API tests share."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store, ts
from .test_changes import P


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
