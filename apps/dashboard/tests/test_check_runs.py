"""The check-run button (spec 039 owner answer 12): the dashboard forwards the owner's press to the
chat service, signed with the reviewer, and comes back to the page with what happened."""

from __future__ import annotations

import json

import httpx2

from .conftest import Store
from .test_chat import ORIGIN, Service, text
from .test_model_facts import seed_model
from .test_processes_pages import P, client, seed

FORM = {"Content-Type": "application/x-www-form-urlencoded", **ORIGIN}


def test_the_button_starts_an_exploration_through_the_chat_service(empty_store: Store) -> None:
    service = Service()
    service.routes[("POST", f"/portals/{P}/check-runs")] = httpx2.Response(
        201, json={"id": "cr-1", "kind": "explore"}
    )
    seed(empty_store)
    seed_model(empty_store)
    with client(empty_store, service) as c:
        page = c.get(f"/processes/PRC-001?portal={P}").text
        assert "Explore now" in text(page)
        r = c.post(
            f"/portals/{P}/check-runs",
            content="kind=explore&process_key=PRC-001&back=%2Fprocesses%2FPRC-001",
            headers=FORM,
            follow_redirects=False,
        )
        assert r.status_code == 303 and r.headers["location"].startswith("/processes/PRC-001?")
        after = c.get(r.headers["location"]).text
    sent = json.loads(service.requests[-1].content)
    assert sent == {"kind": "explore", "author": "Anna", "process_key": "PRC-001"}
    assert "The exploration started" in text(after)


def test_a_busy_portal_and_a_missing_reviewer_are_said_plainly(empty_store: Store) -> None:
    service = Service()
    service.routes[("POST", f"/portals/{P}/check-runs")] = httpx2.Response(
        409, json={"message": "A check run of liveinsurer is still running (replay)."}
    )
    seed(empty_store)
    body = f"kind=replay&back=%2Frules%3Fportal%3D{P}"
    with client(empty_store, service) as c:
        busy = c.post(f"/portals/{P}/check-runs", content=body, headers=FORM)
        assert "Not started: A check run of liveinsurer is still running" in text(busy.text)
    with client(empty_store, service, reviewer=None) as c:
        page = c.get(f"/rules?portal={P}").text
        assert "Run the rule tests" in text(page) and "Set PATHFINDER_REVIEWER" in text(page)
        nobody = c.post(f"/portals/{P}/check-runs", content=body, headers=FORM)
        assert "Set PATHFINDER_REVIEWER to your name" in text(nobody.text)
    foreign = client(empty_store, service).post(f"/portals/{P}/check-runs", content=body)
    assert foreign.status_code == 403
