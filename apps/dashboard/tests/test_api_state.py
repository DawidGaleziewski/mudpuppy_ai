"""The React console's recorded screen (R-100, spec 071): one observed revision of a screen with
its revisions, processes, amendments (every revision, their history) and the marks a person can
set."""

from __future__ import annotations

import json

import httpx2

from .conftest import Store
from .test_chat import ORIGIN, Service
from .test_map import P, model
from .test_map import seed as map_seed
from .test_processes_pages import client as map_client
from .test_screen_detail import client, seeded


def test_a_recorded_screen_gives_its_revisions_processes_and_amendments(empty_store: Store) -> None:
    store = seeded(empty_store)
    with client(store) as c:
        new = c.get("/api/states/st-r2").json()
        old = c.get("/api/states/st-r1").json()
    page = new["page"]
    assert page["head"]["id"] == "st-r2" and page["head"]["portal"] == "liveinsurer"
    assert [r["rev"] for r in page["revisions"]] == [1, 2]
    assert [r["latest"] for r in page["revisions"]] == [False, True]
    assert page["processes"] == [{"name": "Buy a policy", "role": "end"}]
    assert old["page"]["processes"] == []
    (amd,) = new["amendments"]["items"]
    assert amd["key"] == "AMD-001" and amd["rev"] == 2
    assert amd["status"] == {"shape": "live", "word": "Active"}
    assert [h["change"] for h in amd["history"]] == ["create", "carry forward"]
    assert amd["other_state"] is None
    # an older revision still lists the screen's amendment, anchored to the newer one
    assert old["amendments"]["items"][0]["other_state"] == "st-r2"
    assert new["can_mark"] is True


def test_amendment_writes_are_signed_and_answer_a_message(empty_store: Store) -> None:
    store = seeded(empty_store)
    service = Service()
    base = "/portals/liveinsurer/amendments"
    service.routes[("POST", base)] = httpx2.Response(201, json={"key": "AMD-002", "rev": 1})
    service.routes[("PATCH", f"{base}/amd-id-1")] = httpx2.Response(
        200, json={"key": "AMD-001", "rev": 3}
    )
    service.routes[("DELETE", f"{base}/amd-id-1")] = httpx2.Response(200, json={"key": "AMD-001"})
    api = "/api/portals/liveinsurer/amendments"
    with client(store, service) as c:
        added = c.post(
            api,
            json={"state_id": "st-r2", "element": "button-save", "text": " Say Save "},
            headers=ORIGIN,
        )
        edited = c.post(
            f"{api}/amd-id-1/edit", json={"text": "Rename", "base_rev": 2}, headers=ORIGIN
        )
        gone = c.post(f"{api}/amd-id-1/withdraw", json={}, headers=ORIGIN)
        empty = c.post(api, json={"state_id": "st-r2"}, headers=ORIGIN)
        foreign = c.post(api, json={"state_id": "st-r2", "text": "x"})
    assert added.json() == {"ok": True, "message": "AMD-002 added.", "href": None}
    assert edited.json()["message"] == "AMD-001 saved as r3."
    assert gone.json()["message"] == "Withdrawn."
    assert empty.status_code == 422 and foreign.status_code == 403
    sent = [json.loads(r.content) for r in service.requests if r.url.path.startswith(base)]
    assert sent[0] == {
        "kind": "element_ref",
        "target_kind": "wireframe_element",
        "target_id": "st-r2#button-save",
        "text": "Say Save",
        "author": "Anna",
    }
    assert sent[1] == {"text": "Rename", "base_rev": 2, "author": "Anna"}


def test_a_recording_opens_on_its_model_screen_and_the_screen_gets_its_recordings(
    empty_store: Store,
) -> None:
    """Designer Q10: a recording belongs to a model screen's variant; the Screen page shows the
    screen's amendments, inputs and URLs."""
    map_seed(empty_store)
    model(empty_store)
    with map_client(empty_store) as c:
        place = c.get("/api/states/st-f1v").json()["place"]
        recs = c.get(f"/api/portals/{P}/screens/SC-0003/recordings")
        none = c.get(f"/api/portals/{P}/screens/SC-9999/recordings")
    assert place == {"portal": P, "key": "SC-0003", "ordinal": 2}
    assert recs.status_code == 200 and recs.json()["state"] == "st-f1v"
    assert none.status_code == 404


def test_an_unknown_recorded_screen_is_not_found(empty_store: Store) -> None:
    store = seeded(empty_store)
    with client(store) as c:
        r = c.get("/api/states/nope")
    assert r.status_code == 404
    assert "nope" in r.json()["detail"]
