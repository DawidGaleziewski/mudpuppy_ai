"""Spec 078 (designer T-05, T-06): Add to process is a scope change and merging two processes
goes through the chat service signed; the lists and the process page show the scope beyond A's
steps, the processes a screen can be added to, and the merges."""

from __future__ import annotations

import json

import httpx2

from .conftest import Store, insert, ts
from .test_chat import ORIGIN, Service
from .test_processes_pages import P, client, seed


def _service(path: str, answer: dict, status: int = 200) -> Service:
    service = Service()
    service.routes[("POST", path)] = httpx2.Response(status, json=answer)
    return service


def test_add_to_process_says_what_joined_a_and_what_waits_for_a_path(empty_store: Store) -> None:
    answer = {
        "process": {"key": "PRC-001", "name": "Quote"},
        "added": [
            {"state_id": "st-faq", "title": "FAQ", "on_path": False},
            {"state_id": "st-car", "title": "Car", "on_path": True},
        ],
    }
    service = _service(f"/portals/{P}/processes/pr-1/scope", answer)
    with client(seed(empty_store), service) as c:
        r = c.post(
            f"/api/portals/{P}/processes/pr-1/scope",
            json={"state_ids": ["st-faq", "st-car"]},
            headers=ORIGIN,
        )
    assert r.json() == {
        "ok": True,
        "message": "Car added to Quote · its as-is follows what scans saw; FAQ added to Quote's"
        " scope · not on the observed path yet",
        "href": f"/app/portals/{P}/processes/PRC-001",
        "undo": "st-faq,st-car",
    }
    sent = json.loads(service.requests[-1].content)
    assert sent == {"state_ids": ["st-faq", "st-car"], "author": "Anna"}


def test_a_merge_dry_run_answers_the_plan_and_a_merge_its_undo(empty_store: Store) -> None:
    plan = {"name": "Quote", "moves": [], "scope": {"states": ["st-home"]}}
    service = _service(f"/portals/{P}/processes/merge", {"plan": plan})
    with client(seed(empty_store), service) as c:
        dry = c.post(
            f"/api/portals/{P}/processes/merge",
            json={"keep": "pr-1", "absorb": "pr-2", "dry_run": True},
            headers=ORIGIN,
        )
        service.routes[("POST", f"/portals/{P}/processes/merge")] = httpx2.Response(
            200, json={"process": {"key": "PRC-001", "name": "Quote"}, "merge": {"id": "mg-1"}}
        )
        done = c.post(
            f"/api/portals/{P}/processes/merge",
            json={"keep": "pr-1", "absorb": "pr-2", "reason": "one flow"},
            headers=ORIGIN,
        )
    assert dry.json() == {"ok": True, "plan": plan}
    merged = done.json()
    assert merged["undo"] == "mg-1" and merged["message"].startswith("Merged into PRC-001")
    assert json.loads(service.requests[-1].content)["reason"] == "one flow"


def test_different_personas_are_refused_with_the_reason(empty_store: Store) -> None:
    why = "Processes for different personas can't be merged: compare them instead."
    service = _service(f"/portals/{P}/processes/merge", {"message": why}, 409)
    with client(seed(empty_store), service) as c:
        r = c.post(
            f"/api/portals/{P}/processes/merge",
            json={"keep": "pr-1", "absorb": "pr-2", "dry_run": True},
            headers=ORIGIN,
        )
    assert r.status_code == 409 and why in r.json()["message"]


def test_the_scope_and_merges_show_on_the_list_and_the_process_page(empty_store: Store) -> None:
    store = seed(empty_store)
    conn = store.connect()
    insert(conn, "process_scope_screens", id="sc-1", process_id="pr-1", state_id="st-faq",
           author="Anna", added_at=ts(5))  # fmt: skip
    conn.commit()
    conn.close()
    with client(store) as c:
        listed = c.get(f"/api/portals/{P}/processes").json()
        page = c.get(f"/api/portals/{P}/processes/PRC-001").json()
    # a screen in a scope is in a process: not loose; the menu knows it is "already in"
    assert listed["loose"] == []
    target = next(t for t in listed["targets"] if t["key"] == "PRC-001")
    assert target["persona"] == "guest" and target["steps"] == 3
    assert target["states"] == ["st-home", "st-car", "st-driver", "st-faq"]
    assert page["scope"]["off_path"] == [{"state": "st-faq", "title": "FAQ", "route": "/faq"}]
    assert page["scope"]["merged_into"] is None and page["scope"]["merges"] == []
