"""The React console's "+ new portal" (R-100, spec 071; spec 011 FR-004, FR-005, FR-011): the
service writes the files; only environments with an address go, each with its limit."""

from __future__ import annotations

import json
from pathlib import Path

import httpx2

from .conftest import Store
from .test_chat import ORIGIN, Service
from .test_portals import client, configured


def test_a_new_portal_is_saved_with_its_environments_and_a_fresh_conversation(
    empty_store: Store, tmp_path: Path
) -> None:
    service = Service()
    service.routes[("POST", "/portals")] = httpx2.Response(201, json={"portal": "wikipedia-org"})
    service.routes[("POST", "/conversations")] = httpx2.Response(201, json={"id": "conv-w"})
    with client(empty_store, service, configured(tmp_path)) as c:
        form = c.get("/api/portals/new").json()
        r = c.post(
            "/api/portals",
            json={
                "robots": "ignore",
                "environments": {
                    "production": {"base_url": "https://www.wikipedia.org/", "limit": "read"},
                    "sandbox": {"base_url": " ", "limit": "read"},
                },
            },
            headers=ORIGIN,
        )
    assert form["environments"] == ["production", "staging", "sandbox"]
    assert r.json()["href"] == "/app/portals/wikipedia-org?assistant=open"
    sent = next(q for q in service.requests if q.url.path == "/portals")
    assert json.loads(sent.content) == {
        "robots": "ignore",
        "environments": {
            "production": {"base_url": "https://www.wikipedia.org/", "max_action_class": "read"}
        },
    }
    created = next(q for q in service.requests if q.url.path == "/conversations")
    assert json.loads(created.content) == {"portal": "wikipedia-org", "fresh": True}


def test_a_refusal_comes_back_and_a_portal_needs_an_address(
    empty_store: Store, tmp_path: Path
) -> None:
    service = Service()
    service.routes[("POST", "/portals")] = httpx2.Response(
        409, json={"ref": "ERR-1", "message": 'a portal called "liveinsurer" already exists'}
    )
    with client(empty_store, service, configured(tmp_path)) as c:
        taken = c.post(
            "/api/portals",
            json={"id": "liveinsurer", "environments": {"production": {"base_url": "https://liveinsurer.example"}}},
            headers=ORIGIN,
        )
        empty = c.post("/api/portals", json={"environments": {}}, headers=ORIGIN)
        cross = c.post("/api/portals", json={"environments": {}})
    assert taken.status_code == 400 and "already exists" in taken.json()["message"]
    assert empty.status_code == 422 and cross.status_code == 403
