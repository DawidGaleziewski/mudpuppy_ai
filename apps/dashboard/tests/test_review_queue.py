"""Review's 2.0 queue (spec 039 T100, designer screens v2-04 / v2-05 / v2-16): the portal model's
findings, rules, removals and process proposals first; Explained automatically and Decided tabs;
confirming or rejecting goes through the chat service, signed with the reviewer."""

from __future__ import annotations

import json
import sqlite3

import httpx2

from pathfinder_dashboard import queries_queue, queries_review

from .conftest import Store, ts
from .test_changes import P, seed, seed_rule_and_rename
from .test_chat import ORIGIN, Service, text
from .test_processes_pages import client

FORM = {"Content-Type": "application/x-www-form-urlencoded", **ORIGIN}


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


def test_a_rule_is_decided_through_the_chat_service(empty_store: Store) -> None:
    service = Service()
    service.routes[("POST", f"/portals/{P}/model/decide")] = httpx2.Response(
        201, json={"decided": [{"key": "H-0002", "status": "confirmed"}]}
    )
    seed_queue(empty_store)
    with client(empty_store, service) as c:
        page = c.get(f"/review?portal={P}&select=rules:H-0002").text
        assert 'action="/review/hypotheses/liveinsurer' in page and 'value="H-0002"' in page
        assert "Confirm 2" in page  # the two removals, one decision
        r = c.post(
            f"/review/hypotheses/{P}",
            content="keys=H-0002&action=confirm&reason=&select=rules%3AH-0002",
            headers=FORM,
            follow_redirects=False,
        )
        assert r.status_code == 303
        after = text(c.get(r.headers["location"]).text)
        empty = c.post(
            f"/review/hypotheses/{P}", content="keys=H-0005&action=reject&reason=", headers=FORM
        )
        assert "A reject needs a reason" in text(empty.text)
    sent = [json.loads(q.content) for q in service.requests if q.url.path.endswith("/decide")]
    assert sent == [
        {"keys": ["H-0002"], "decision": "confirm", "by": "Anna", "reason": "Confirmed in Review."}
    ]
    assert "Confirmed: H-0002." in after


def test_explained_and_decided_tabs(empty_store: Store) -> None:
    seed_queue(empty_store)
    with client(empty_store) as c:
        explained = text(c.get(f"/review?portal={P}&tab=explained").text)
        decided = c.get(f"/review?portal={P}&tab=decided").text
    assert "Explained automatically" in explained and "Part of a rename" in explained
    assert "R-87" in explained
    assert ">H-0001<" in decided and "Seen the release." in decided and "sy-note" in decided
