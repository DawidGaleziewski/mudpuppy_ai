"""Same screen? (spec 039 T100, designer screen v2-14): the queue of pairs (conflicts first), one
pair side by side, and the answer forwarded to the chat service's label route."""

from __future__ import annotations

import json
import sqlite3
import struct

import httpx2

from mudpuppy_dashboard import queries_same_screen

from .conftest import Store, insert, ts
from .test_chat import ORIGIN, Service
from .test_map import P, model, seed
from .test_processes_pages import client


def labelled(store: Store, a: str, b: str, label: str, reason: str | None = None) -> None:
    conn = store.connect()
    conn.execute(
        "INSERT INTO state_pair_labels (portal_id, state_a, state_b, label, labelled_by,"
        " labelled_at, reason) VALUES (?, ?, ?, ?, 'Marek', ?, ?)",
        (P, a, b, label, ts(40), reason),
    )
    conn.commit()
    conn.close()


def pairs(store: Store, screen: str | None = None) -> list[tuple[str, str, bool]]:
    conn = store.connect()
    conn.row_factory = sqlite3.Row
    try:
        q = queries_same_screen.queue(conn, P, screen)
    finally:
        conn.close()
    return [(p.a.state_id, p.b.state_id, p.conflict) for p in q]


def test_each_screens_variants_are_asked_against_its_first_one(empty_store: Store) -> None:
    seed(empty_store)
    model(empty_store)
    assert sorted(pairs(empty_store)) == [("st-a", "st-ab", False), ("st-f1", "st-f1v", False)]
    assert pairs(empty_store, "SC-0003") == [("st-f1", "st-f1v", False)]


def with_minhash(store: Store, state: str, changed: int) -> None:
    """A MinHash signature equal to the base one but for `changed` of its 128 positions."""
    base = list(range(1, 129))
    sig = [v + 1000 if i < changed else v for i, v in enumerate(base)]
    conn = store.connect()
    conn.execute(
        "INSERT INTO state_components (state_id, structure_hash, content_hash, overlay_hash,"
        " calls_hash, mounts_hash, minhash, element_keys) VALUES (?, ?, ?, ?, ?, ?, ?, '[]')",
        (state, *(["0" * 64] * 5), struct.pack(">128I", *sig)),
    )
    conn.commit()
    conn.close()


def test_pairs_nearest_tau_come_before_the_variants(empty_store: Store) -> None:
    """Spec 040 T022 (F-53): the labelling queue of `pnpm model:pairs`: same route, similarity
    within 0.05 of τ (0.9 here), nearest first; then each screen's variants."""
    seed(empty_store)
    model(empty_store)
    conn = empty_store.connect()
    insert(
        conn, "states", id="st-f2", fingerprint="fp-st-f2", route_template="/form", title="Apply",
        cluster_id="cl-x", first_seen_run="r2", created_at=ts(14),
    )  # fmt: skip
    conn.commit()
    conn.close()
    with_minhash(empty_store, "st-f1", 0)
    with_minhash(empty_store, "st-f2", 13)  # 115 of 128 equal: 0.898, next to τ
    with_minhash(empty_store, "st-f1v", 64)  # 0.5 from st-f1: far from τ
    assert [p[:2] for p in pairs(empty_store)] == [
        ("st-f1", "st-f2"),
        ("st-f1", "st-f1v"),
        ("st-a", "st-ab"),
    ]
    with client(empty_store) as c:
        page = c.get(f"/api/portals/{P}/same-screen").json()["page"]
    assert page["tau"] == 0.9 and page["pair"]["b"]["state"] == "st-f2"


def test_a_label_the_model_disagrees_with_comes_first_and_an_agreeing_one_drops(
    empty_store: Store,
) -> None:
    seed(empty_store)
    model(empty_store)
    labelled(empty_store, "st-f1", "st-f1v", "distinct", "The error page is its own screen.")
    labelled(empty_store, "st-a", "st-ab", "near_duplicate")
    assert pairs(empty_store) == [("st-f1", "st-f1v", True)]


def answered(store: Store, rows: list[tuple[str, str, str, str | None]]) -> None:
    """Answers for st-f1 / st-f1v, oldest first: (by, label, at, reason); the last is the label."""
    conn = store.connect()
    for i, (by, label, at, reason) in enumerate(rows):
        conn.execute(
            "INSERT INTO state_pair_label_history (id, portal_id, state_a, state_b, label,"
            " labelled_by, labelled_at, reason) VALUES (?, ?, 'st-f1', 'st-f1v', ?, ?, ?, ?)",
            (f"h{i}", P, label, by, at, reason),
        )
    by, label, at, reason = rows[-1]
    conn.execute(
        "INSERT INTO state_pair_labels (portal_id, state_a, state_b, label, labelled_by,"
        " labelled_at, reason) VALUES (?, 'st-f1', 'st-f1v', ?, ?, ?, ?)",
        (P, label, by, at, reason),
    )
    conn.commit()
    conn.close()


def test_an_earlier_answer_stays_on_the_pair(empty_store: Store) -> None:
    seed(empty_store)
    model(empty_store)
    answered(
        empty_store,
        [
            ("Marek", "distinct", ts(40), "The banner changes the purpose."),
            ("Anna", "near_duplicate", ts(41), None),
        ],
    )
    with client(empty_store) as c:
        pair = c.get(f"/api/portals/{P}/same-screen", params={"a": "st-f1", "b": "st-f1v"}).json()[
            "page"
        ]["pair"]
    assert pair["label"]["by"] == "Anna"
    assert [(e["by"], e["reason"]) for e in pair["earlier"]] == [
        ("Marek", "The banner changes the purpose.")
    ]


def test_confirming_a_variant_finding_also_settles_its_pairs(empty_store: Store) -> None:
    """Spec 040 T023 (designer § 5.5): the A/B finding about st-f1v lists its Same screen? pair
    under Also settles; confirming it answers the pair "Same screen" with the reason."""
    seed(empty_store)
    model(empty_store)
    conn = empty_store.connect()
    conn.execute(
        "INSERT INTO deviations (id, portal_id, model_version_id, kind, subject_key, screen_id,"
        " state_id, status, created_at) VALUES ('dv', ?, 'mv1', 'new_member', 'new_member:f1v',"
        " (SELECT id FROM model_screens WHERE key = 'SC-0003'), 'st-f1v', 'open', ?)",
        (P, ts(40)),
    )
    conn.execute(
        "INSERT INTO hypotheses (id, key, portal_id, kind, claim, claim_json, claim_hash, origin,"
        " rule, derived, confidence, deviation_id, model_version_id, created_at) VALUES ('hv',"
        " 'H-0009', ?, 'ab_test', 'A cookie splits the form.', '{}', ?, 'rule', 'R5', 0,"
        " 'needs_confirmation', 'dv', 'mv1', ?)",
        (P, "9" * 64, ts(40)),
    )
    conn.execute(
        "INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason,"
        " at) VALUES ('hev', 'hv', NULL, 'proposed', 'reconciler', 'R5', ?)",
        (ts(40),),
    )
    conn.commit()
    conn.close()
    service = Service()
    service.routes[("POST", f"/portals/{P}/model/decide")] = httpx2.Response(
        201, json={"decision": "cmd-9", "decided": [{"key": "H-0009", "status": "confirmed"}]}
    )
    service.routes[("POST", f"/portals/{P}/model/label")] = httpx2.Response(201, json={})
    with client(empty_store, service) as c:
        r = c.post(
            f"/api/portals/{P}/review/decide",
            json={
                "keys": ["H-0009"],
                "action": "confirm",
                "reason": "arms of one form",
                "also": ["st-f1:st-f1v"],
            },
            headers=ORIGIN,
        )
    assert "Also settled 1 of 1 Same screen? pairs." in r.json()["message"]
    (label,) = [json.loads(q.content) for q in service.requests if q.url.path.endswith("/label")]
    assert label == {
        "a": "st-f1",
        "b": "st-f1v",
        "answer": "same",
        "by": "Anna",
        "reason": "arms of one form (with H-0009)",
    }
