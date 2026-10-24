"""The React console's Processes list (R-96, spec 057): processes, suggestions and screens in no
process as JSON; the list's writes go to the chat service signed and answer
`{ok, message, href}`."""

from __future__ import annotations

import json

import httpx2

from .conftest import Store, insert
from .test_chat import ORIGIN, Service
from .test_processes_pages import P, client, seed


def test_the_list_has_processes_suggestions_and_loose_screens(empty_store: Store) -> None:
    with client(seed(empty_store)) as c:
        body = c.get(f"/api/portals/{P}/processes").json()
        archived = c.get(f"/api/portals/{P}/processes?archived=true").json()
        missing = c.get("/api/portals/nowhere/processes")
    row = body["rows"][0]
    assert (row["key"], row["name"], row["stage"]["word"]) == (
        "PRC-001",
        "Quote",
        "To-be in design",
    )
    assert [(m["label"], m["kind"], m["rev"]) for m in row["models"]] == [
        ("A", "as-is", 1),
        ("B", "to-be", 1),
    ]
    assert row["models"][1]["draft"]["word"] == "Draft open" and row["models"][0]["draft"] is None
    assert row["live"] == [
        {"environment": "sandbox", "status": {"shape": "live", "word": "Live"}, "what": "A r1"}
    ]
    assert (row["start_route"], row["end_route"], row["screens"]) == ("/", "/driver", 3)
    assert body["suggestions"] == [
        {
            "id": "sg-1",
            "name": "Help pages",
            "persona": "guest",
            "routes": ["/faq"],
            "why": 'menu link "FAQ"',
        }
    ]
    assert [s["state"] for s in body["loose"]] == ["st-faq"]
    assert body["stages"][0]["word"] == "Suggested" and body["total"] == 1
    assert archived["archived"] is True and archived["rows"] == []
    assert missing.status_code == 404


def test_a_loose_screen_names_the_personas_whose_scans_recorded_it(empty_store: Store) -> None:
    """Spec 079 FR-003 (owner D-6 (a)): the Add to process menu lists those personas' processes."""
    seed(empty_store)
    conn = empty_store.connect()
    insert(conn, "runs", id="run-p2", portal_id=P, persona_id="client")
    for run, persona in (("run-p1", "guest"), ("run-p2", "client")):
        insert(conn, "state_observations", run_id=run, state_id="st-faq", persona_id=persona)
    conn.commit()
    conn.close()
    with client(empty_store) as c:
        (faq,) = c.get(f"/api/portals/{P}/processes").json()["loose"]
    assert faq["personas"] == ["client", "guest"]


def test_accepting_a_suggestion_is_signed_and_answers_the_new_process(empty_store: Store) -> None:
    service = Service()
    service.routes[("POST", f"/portals/{P}/suggestions/sg-1/accept")] = httpx2.Response(
        201, json={"process": {"key": "PRC-002"}, "variant": {"label": "A"}}
    )
    with client(seed(empty_store), service) as c:
        r = c.post(f"/api/portals/{P}/suggestions/sg-1/accept", json={}, headers=ORIGIN)
    assert r.json() == {
        "ok": True,
        "message": "Accepted: it is a process now.",
        "href": f"/app/portals/{P}/processes/PRC-002?model=A",
    }
    sent = service.requests[-1]
    assert json.loads(sent.content) == {"author": "Anna"}


def test_a_new_process_split_and_a_refusal(empty_store: Store) -> None:
    service = Service()
    service.routes[("POST", f"/portals/{P}/processes")] = httpx2.Response(
        201, json={"process": {"key": "PRC-002"}}
    )
    with client(seed(empty_store), service) as c:
        made = c.post(
            f"/api/portals/{P}/processes",
            json={"name": "Help", "persona": "guest", "state_ids": ["st-faq"]},
            headers=ORIGIN,
        )
        empty = c.post(f"/api/portals/{P}/processes", json={"name": "Help"}, headers=ORIGIN)
        split = c.post(f"/api/portals/{P}/suggestions/sg-1/split", json={"at": 2}, headers=ORIGIN)
        bogus = c.post(f"/api/portals/{P}/suggestions/sg-1/explode", json={}, headers=ORIGIN)
        foreign = c.post(f"/api/portals/{P}/suggestions/sg-1/dismiss", json={})
    assert made.json()["href"] == f"/app/portals/{P}/processes/PRC-002?model=A"
    body = json.loads(service.requests[0].content)
    assert body == {"name": "Help", "persona": "guest", "state_ids": ["st-faq"], "author": "Anna"}
    assert empty.status_code == 422
    # the scripted service has no split route: its 404 comes back as the refusal
    assert split.status_code == 502 and "No such address." in split.json()["message"]
    assert json.loads(service.requests[-1].content) == {"at": 2, "author": "Anna"}
    assert bogus.status_code == 404 and foreign.status_code == 403


def test_no_reviewer_no_writes(empty_store: Store) -> None:
    with client(seed(empty_store), reviewer=None) as c:
        r = c.post(
            f"/api/portals/{P}/processes/pr-1/unarchive", json={"base_rev": 1}, headers=ORIGIN
        )
    assert r.status_code == 409 and "MUDPUPPY_REVIEWER" in r.json()["message"]
