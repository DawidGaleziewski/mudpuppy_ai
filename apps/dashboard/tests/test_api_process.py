"""The React console's one process (R-96, spec 058): the head, the models, A as documentation,
a to-be model with what its steps are built from, the selected step; its writes go to the chat
service signed and answer `{ok, message, href}`."""

from __future__ import annotations

import json

import httpx2

from .conftest import Store
from .test_chat import ORIGIN, Service
from .test_processes_pages import P, client, seed

API = f"/api/portals/{P}/processes"


def test_a_process_opens_on_its_first_to_be_in_design(empty_store: Store) -> None:
    with client(seed(empty_store)) as c:
        page = c.get(f"{API}/PRC-001").json()
        a = c.get(f"{API}/PRC-001?model=A&step=s2").json()
        missing = c.get(f"{API}/PRC-404")
    assert page["model"]["label"] == "B" and page["model"]["kind"] == "to-be"
    assert (page["key"], page["name"], page["stage"]["word"]) == (
        "PRC-001",
        "Quote",
        "To-be in design",
    )
    assert [m["label"] for m in page["models"]] == ["A", "B"]
    assert page["models"][1]["draft"]["word"] == "Draft open"
    assert page["live"][0]["what"] == "A r1" and page["screens"] == 3
    # Anna sees her own draft of B; each step says what it is built from and how it changed
    assert [s["title"] for s in page["steps"]] == ["Home", "One form", "Offer"]
    assert page["steps"][1]["built_from"] == ["Car /car", "Driver /driver"]
    assert page["steps"][2]["observed"] is False and page["steps"][1]["records"] == []
    ed = page["editor"]
    assert ed["editable"] is True and ed["draft"]["base_rev"] == 1
    # two new steps, two of B's steps gone
    assert ed["draft"]["conflict"] is False and ed["draft"]["pending"] == 4
    assert ed["changes"]["m1"]["word"] == "Merged" and ed["changes"]["n1"]["word"] == "Added"
    assert [s["id"] for s in ed["steps"]] == ["s1", "m1", "n1"]
    assert ed["as_is"][0] == "1 · Home /"
    assert a["model"]["label"] == "A" and a["selected"]["id"] == "s2"
    assert a["selected"]["state"] == "st-car" and a["selected"]["observed"] is True
    assert a["as_is"]["sign_off"] is None and a["as_is"]["sign_off_action"] is None
    assert {o["value"] for o in a["as_is"]["addable"]} == {"st-faq"}
    assert a["as_is"]["stages"][0]["value"] == "scoped"
    assert missing.status_code == 404
    assert a["editor"] is None


def test_without_a_draft_a_person_sees_the_head(empty_store: Store) -> None:
    with client(seed(empty_store), reviewer="Bob") as c:
        bob = c.get(f"{API}/PRC-001").json()
    assert [s["title"] for s in bob["steps"]] == ["Home", "Car", "Driver"]
    assert bob["editor"]["draft"] is None and bob["editor"]["removed"] == []


def test_a_draft_on_an_older_revision_is_a_conflict(empty_store: Store) -> None:
    with client(seed(empty_store, b_rev=2, draft_base=1)) as c:
        anna = c.get(f"{API}/PRC-001").json()
    assert anna["editor"]["draft"]["conflict"] is True


def test_the_head_writes_are_signed(empty_store: Store) -> None:
    service = Service()
    service.routes[("POST", f"/portals/{P}/processes/pr-1/models")] = httpx2.Response(
        201, json={"process": {"key": "PRC-001"}, "variant": {"label": "C"}}
    )
    service.routes[("POST", f"/portals/{P}/processes/pr-1")] = httpx2.Response(
        200, json={"id": "pr-1", "stage": "as_is_documented"}
    )
    service.routes[("POST", f"/portals/{P}/processes/pr-1/models/A/edit")] = httpx2.Response(
        201, json={"process": {"key": "PRC-001"}, "variant": {"label": "A"}}
    )
    service.routes[("POST", f"/portals/{P}/check-runs")] = httpx2.Response(201, json={})
    with client(seed(empty_store), service) as c:
        model = c.post(f"{API}/pr-1/models", json={"from": "B"}, headers=ORIGIN)
        stage = c.post(
            f"{API}/pr-1/stage", json={"stage": "as_is_documented", "base_rev": 1}, headers=ORIGIN
        )
        bad = c.post(f"{API}/pr-1/stage", json={"stage": "nowhere"}, headers=ORIGIN)
        edit = c.post(
            f"{API}/pr-1/models/A/edit",
            json={"base_rev": 1, "state_ids": ["st-car", "st-home"]},
            headers=ORIGIN,
        )
        empty = c.post(f"{API}/pr-1/models/A/edit", json={"state_ids": []}, headers=ORIGIN)
        run = c.post(
            f"/api/portals/{P}/check-runs",
            json={"kind": "explore", "process_key": "PRC-001"},
            headers=ORIGIN,
        )
    assert model.json()["href"] == f"/app/portals/{P}/processes/PRC-001?model=C"
    assert stage.json() == {"ok": True, "message": "Stage set; it shows in History.", "href": None}
    assert bad.status_code == 422 and empty.status_code == 422
    assert edit.json()["ok"] is True and run.json()["message"].startswith("The exploration started")
    bodies = [json.loads(r.content) for r in service.requests]
    assert bodies[0] == {"from": "B", "author": "Anna"}
    assert bodies[1] == {"stage": "as_is_documented", "base_rev": 1, "author": "Anna"}
    assert bodies[2] == {"base_rev": 1, "state_ids": ["st-car", "st-home"], "author": "Anna"}
    assert bodies[3] == {"kind": "explore", "process_key": "PRC-001", "author": "Anna"}


def test_the_draft_is_autosaved_discarded_saved_and_rebased(empty_store: Store) -> None:
    service = Service()
    base = f"/portals/{P}/processes/pr-1/models/B"
    for method, path in (
        ("PUT", f"{base}/draft"),
        ("DELETE", f"{base}/draft"),
        ("POST", f"{base}/save"),
        ("POST", f"{base}/rebase"),
    ):
        service.routes[(method, path)] = httpx2.Response(200, json={})
    steps = [{"id": "s1", "title": "Home", "route": "/"}]
    with client(seed(empty_store), service) as c:
        saved = c.post(
            f"{API}/pr-1/models/B/draft", json={"base_rev": 1, "steps": steps}, headers=ORIGIN
        )
        c.post(f"{API}/pr-1/models/B/discard", json={}, headers=ORIGIN)
        c.post(
            f"{API}/pr-1/models/B/save", json={"base_rev": 1, "note": "one form"}, headers=ORIGIN
        )
        c.post(f"{API}/pr-1/models/B/rebase", json={}, headers=ORIGIN)
        on_a = c.post(f"{API}/pr-1/models/A/draft", json={"steps": steps}, headers=ORIGIN)
        bogus = c.post(f"{API}/pr-1/models/B/explode", json={}, headers=ORIGIN)
    assert saved.json()["message"] == "Draft saved; only you see it until you save."
    sent = [(r.method, r.url.path, json.loads(r.content)) for r in service.requests]
    assert sent == [
        ("PUT", f"{base}/draft", {"base_rev": 1, "steps": steps, "author": "Anna"}),
        ("DELETE", f"{base}/draft", {"author": "Anna"}),
        ("POST", f"{base}/save", {"base_rev": 1, "note": "one form", "author": "Anna"}),
        ("POST", f"{base}/rebase", {"author": "Anna"}),
    ]
    assert on_a.status_code == 404 and bogus.status_code == 404
