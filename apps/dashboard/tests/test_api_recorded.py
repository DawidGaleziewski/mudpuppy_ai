"""The React console's recorded map and Recorded pages (R-96, spec 054): every recorded screen
placed with its chips for the layers asked, edges in their state, whole scan ids (D-9), one node
with its marks, and the recorded pages 25 a page."""

from __future__ import annotations

from .conftest import Store
from .test_map import P, client, mark, seed


def test_the_recorded_map_places_screens_with_their_chips(empty_store: Store) -> None:
    seed(empty_store)
    with client(empty_store) as c:
        body = c.get(f"/api/portals/{P}/map/recorded").json()
        links = c.get(f"/api/portals/{P}/map/recorded?layers=&layers=links").json()
        one = c.get(f"/api/portals/{P}/map/recorded?scan=r1").json()
    assert body["has_model"] is False and body["views"] == []
    assert body["filter"] == {
        "scan": None,
        "persona": None,
        "layers": ["states", "errors", "frontier"],
        "open": None,
    }
    assert [s["id"] for s in body["scans"]] == ["r2", "r1"]  # whole ids, newest first
    assert body["scans"][1]["status"] == {"shape": "ok", "word": "Completed"}
    n = {x["id"]: x for x in body["nodes"]}
    assert n["sc-form"]["deck"] and n["sc-form"]["states"] == 2
    assert [c["word"] for c in n["sc-form"]["chips"]] == ["2 states", "+2 queued"]
    assert n["sc-a"]["state"] == "failed" and n["sc-a"]["status"]["word"] == "Failed"
    assert n["sc-a"]["chips"] == [{"word": "1 failed", "variant": "fail"}]
    assert n["sc-home"]["state"] is None and n["sc-home"]["first_state"] == "st-home"
    assert (body["screens"], body["transitions"], body["queued"]) == (5, 4, 2)
    assert sorted(e["state"] or "" for e in body["edges"]) == ["", "", ""]
    # All links only: the move back home is drawn; no chips for the layers left out
    assert "retired" in {e["state"] for e in links["edges"]}
    assert all(x["chips"] == [] for x in links["nodes"])
    # One scan: the screens the other scan saw are not in these scans, its moves other scans'
    m = {x["id"]: x for x in one["nodes"]}
    assert one["filter"]["scan"] == "r1"
    assert m["sc-form"]["state"] == "unobserved"
    assert "unseen" in {e["state"] for e in one["edges"]}


def test_an_unknown_scan_or_persona_means_every_scan(empty_store: Store) -> None:
    seed(empty_store)
    with client(empty_store) as c:
        body = c.get(f"/api/portals/{P}/map/recorded?scan=nope&persona=nobody").json()
        missing = c.get("/api/portals/nowhere/map/recorded")
    assert body["filter"]["scan"] is None and body["filter"]["persona"] is None
    assert missing.status_code == 404


def test_one_node_has_its_facts_and_the_marks_a_person_can_set(empty_store: Store) -> None:
    seed(empty_store)
    mark(empty_store)
    with client(empty_store) as c:
        form = c.get(f"/api/portals/{P}/map/recorded/sc-form").json()
        home = c.get(f"/api/portals/{P}/map/recorded/sc-home").json()
        gone = c.get(f"/api/portals/{P}/map/recorded/sc-nowhere")
    assert [s["label"] for s in form["states"]] == ["Step 1 · Your details"] * 2
    assert [s["kind"]["word"] for s in form["states"]] == ["Main", "Validation"]
    assert [s["id"] for s in form["scans"]] == ["r2"]
    assert {i["label"] for i in form["items"]} == {"Help", "Terms"}
    assert form["items"][0]["status"]["word"] == "Queued"
    assert form["probe"] == {"state": "st-f1", "on": True}
    assert [m["kind"] for m in form["marks"]] == ["start", "focus", "recheck", "retry", "skip"]
    assert all(not m["on"] and m["state"] == "st-f1" for m in form["marks"])
    assert home["probe"] is None
    assert {m["to_route"] for m in home["moves"]} == {"/a", "/form"}
    assert gone.status_code == 404


def test_the_recorded_pages_list_every_page_with_a_filter(empty_store: Store) -> None:
    seed(empty_store)
    mark(empty_store)
    with client(empty_store) as c:
        body = c.get(f"/api/portals/{P}/screens/recorded").json()
        some = c.get(f"/api/portals/{P}/screens/recorded?q=prod").json()
    assert body["total"] == 6 and body["pages"] == 1 and body["page"] == 1
    form = next(r for r in body["rows"] if r["state"] == "st-f1")
    assert form["probe_marked"] is True and form["probe"] is None
    home = next(r for r in body["rows"] if r["state"] == "st-home")
    assert home["probe"] is None and home["scans"] == 2 and home["picture"] is None
    assert home["confidence"]["shape"] is not None
    assert (body["steps"], body["steps_marked"]) == (1, 1)
    assert sorted(r["route"] for r in some["rows"]) == ["/a", "/a/b"] and some["total"] == 2
    assert some["every"] == 6 and some["q"] == "prod"
