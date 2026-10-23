"""The React console's Same screen? (R-100, spec 071): the pair, conflicts first, and the answer
sent to the chat service signed with the reviewer."""

from __future__ import annotations

import json

import httpx2

from .conftest import Store
from .test_chat import ORIGIN, Service
from .test_map import P, model, seed
from .test_processes_pages import client
from .test_same_screen import labelled


def test_the_pair_comes_with_the_conflict_and_the_next_pair(empty_store: Store) -> None:
    seed(empty_store)
    model(empty_store)
    labelled(empty_store, "st-f1", "st-f1v", "distinct", "The error page is its own screen.")
    with client(empty_store) as c:
        first = c.get(f"/api/portals/{P}/same-screen").json()
        other = c.get(f"/api/portals/{P}/same-screen", params={"a": "st-a", "b": "st-ab"}).json()
    pair = first["page"]["pair"]
    assert pair["conflict"] is True and pair["model_answer"] == "same"
    assert pair["label"]["by"] == "Marek" and pair["label"]["answer"] == "different"
    assert (pair["position"], pair["total"]) == (1, 2)
    assert pair["next_pair"] == ["st-a", "st-ab"]
    assert [k for k, _ in first["page"]["answers"]] == ["same", "same_data", "different"]
    assert other["page"]["pair"]["conflict"] is False and other["page"]["pair"]["position"] == 2
    assert first["can_answer"] is True


def test_an_answer_is_sent_signed_and_answers_a_message(empty_store: Store) -> None:
    seed(empty_store)
    model(empty_store)
    service = Service()
    service.routes[("POST", f"/portals/{P}/model/label")] = httpx2.Response(201, json={})
    url = f"/api/portals/{P}/same-screen/label"
    with client(empty_store, service) as c:
        ok = c.post(
            url,
            json={"a": "st-a", "b": "st-ab", "answer": "same_data", "why": "price only"},
            headers=ORIGIN,
        )
        bad = c.post(url, json={"a": "st-a", "b": "st-ab", "answer": "maybe"}, headers=ORIGIN)
        foreign = c.post(url, json={"a": "st-a", "b": "st-ab", "answer": "same"})
    assert ok.json()["message"] == "Saved: Same, different data. The next model rebuild applies it."
    assert json.loads(service.requests[-1].content) == {
        "a": "st-a",
        "b": "st-ab",
        "answer": "same_data",
        "by": "Anna",
        "reason": "price only",
    }
    assert bad.status_code == 422 and foreign.status_code == 403
