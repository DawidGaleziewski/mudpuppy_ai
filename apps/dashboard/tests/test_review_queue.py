"""Review's 2.0 queue (spec 039 T100, designer screens v2-04 / v2-05 / v2-16): the portal model's
findings, rules, removals and process proposals first; Explained automatically and Decided tabs;
confirming or rejecting goes through the chat service, signed with the reviewer."""

from __future__ import annotations

import sqlite3

from mudpuppy_dashboard import queries_queue, queries_review

from .conftest import Store, ts
from .test_changes import P, seed, seed_rule_and_rename


def seed_queue(store: Store) -> Store:
    """Changes and a tested rule (test_changes), two links gone without a release, a process
    proposal, and one decision a person made."""
    seed(store)
    seed_rule_and_rename(store)
    conn = store.connect()
    for i in (5, 6):
        conn.execute(
            "INSERT INTO deviations (id, portal_id, model_version_id, kind, subject_key,"
            " screen_id, status, created_at) VALUES (?, ?, 'mv2', 'missing_action', ?, 'M1',"
            " 'open', ?)",
            (f"d{i}", P, f"missing_action:{i}", ts(i)),
        )
        conn.execute(
            "INSERT INTO hypotheses (id, key, portal_id, kind, claim, claim_json, claim_hash,"
            " origin, rule, derived, confidence, deviation_id, model_version_id, created_at)"
            " VALUES (?, ?, ?, 'removed', ?, '{}', ?, 'rule', 'R6', 0, 'needs_confirmation', ?,"
            " 'mv2', ?)",
            (f"h{i}", f"H-000{i}", P, f"Link {i} gone within one build.", str(i) * 64,
             f"d{i}", ts(i)),
        )  # fmt: skip
        conn.execute(
            "INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor,"
            " reason, at) VALUES (?, ?, NULL, 'proposed', 'reconciler', 'R6', ?)",
            (f"he{i}", f"h{i}", ts(i)),
        )
    conn.execute(
        "INSERT INTO grouping_suggestions (id, portal_id, name, persona, steps, why,"
        " screens_key, created_at) VALUES ('gs1', ?, 'Napisz do nas', 'guest', '[]',"
        " 'Kontakt leads to Wiadomość wysłana', 'st-a', ?)",
        (P, ts(7)),
    )
    conn.execute(
        "INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason,"
        " at) VALUES ('he9', 'h1', 'confirmed', 'confirmed', 'Anna', 'Seen the release.', ?)",
        (ts(8),),
    )
    conn.commit()
    conn.close()
    return store


def test_the_model_groups_come_first_with_their_items(empty_store: Store) -> None:
    seed_queue(empty_store)
    conn = empty_store.connect()
    conn.row_factory = sqlite3.Row
    inbox = queries_review.inbox(conn, P)
    assert [k for k, _ in queries_review.KINDS][:4] == [
        "findings",
        "rules",
        "removals",
        "processes",
    ]
    assert {i.id for i in inbox.findings} == {"d2", "d3"}
    (rule,) = inbox.rules
    assert (rule.id, rule.status, rule.keys) == ("H-0002", "tested", ("H-0002",))
    assert [i.keys for i in inbox.removals] == [("H-0006",), ("H-0005",)]
    assert [i.claim for i in inbox.processes] == ["Napisz do nas"]
    assert queries_review.count(conn, P) == inbox.total == 6
    (d,) = queries_queue.decided(conn, P)
    assert (d.key, d.actor, d.reason) == ("H-0001", "Anna", "Seen the release.")
    conn.close()


def test_alike_items_form_groups(empty_store: Store) -> None:
    """Spec 040 T011 (designer § 5.4): alike items get one line with one action."""
    seed_queue(empty_store)
    conn = empty_store.connect()
    conn.row_factory = sqlite3.Row
    inbox = queries_review.inbox(conn, P)
    (g,) = inbox.similar("removals")
    assert g.keys == ("H-0006", "H-0005") and g.label.endswith("model version 2")
    assert inbox.similar("records") == []
    conn.close()


def test_reasons_are_suggested_per_kind(empty_store: Store) -> None:
    """Spec 040 T012 (designer § 5.3): your last reasons for the same kind, without repeats."""
    seed_queue(empty_store)
    conn = empty_store.connect()
    conn.row_factory = sqlite3.Row
    reasons = queries_queue.recent_reasons(conn, P)
    conn.close()
    assert reasons["findings"] == ["Seen the release."] and reasons["removals"] == []
