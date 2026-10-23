"""The React console's map API (R-96, spec 053): the model's map placed and drawn, its layers,
views and overlay from the address, link states mapped; a screen's actions say where they go."""

from __future__ import annotations

from .conftest import Store
from .test_map import P, client, model, seed
from .test_model_screens import seed_screens


def test_the_map_places_screens_and_draws_links_in_their_state(empty_store: Store) -> None:
    seed(empty_store)
    model(empty_store)
    with client(empty_store) as c:
        body = c.get(f"/api/portals/{P}/map").json()
        none_ticked = c.get(f"/api/portals/{P}/map?layers=").json()
    assert body["has_model"] is True
    assert body["filter"] == {
        "view": "now",
        "layers": ["unseen", "unchecked"],
        "process": None,
        "open": None,
    }
    assert {n["key"] for n in body["nodes"]} == {f"SC-000{i}" for i in range(1, 5)}
    assert sorted(e["state"] or "" for e in body["edges"]) == ["", "", "unseen"]
    assert sorted(e["state"] or "" for e in none_ticked["edges"]) == ["", ""]
    assert none_ticked["filter"]["layers"] == []
    home = next(n for n in body["nodes"] if n["key"] == "SC-0001")
    assert home["status"] == {"shape": "live", "word": "Active"} and home["retired"] is False
    assert home["inside"] == {"word": "0 actions inside", "variant": None}
    assert all(e["d"].startswith("M") for e in body["edges"])
    states = {
        link["status"]["word"] if link["status"] else None
        for links in body["out_links"].values()
        for link in links
    }
    assert states == {None, "Not seen lately"}  # an active link says nothing
    assert {"value": "", "label": "Active"} in body["legend"]


def test_since_and_an_overlay_come_from_the_address(empty_store: Store) -> None:
    seed_screens(empty_store)
    with client(empty_store) as c:
        first = c.get(f"/api/portals/{P}/map").json()
        key = first["processes"][0]["key"]
        since = c.get(f"/api/portals/{P}/map?view=since").json()
        overlay = c.get(f"/api/portals/{P}/map?process={key}").json()
        nonsense = c.get(f"/api/portals/{P}/map?view=path&open=nowhere").json()
    assert since["filter"]["view"] == "since" and since["changed"] > 0
    changed = next(n for n in since["nodes"] if n["key"] == "SC-0001")
    assert changed["chips"] and changed["dim"] is False
    assert overlay["overlay"]["key"] == key
    assert next(n for n in overlay["nodes"] if n["key"] == "SC-0001")["role"] == "Step 1"
    assert nonsense["filter"]["view"] == "now" and nonsense["filter"]["open"] is None


def test_a_portal_without_a_model_has_an_empty_map(empty_store: Store) -> None:
    seed(empty_store)
    with client(empty_store) as c:
        body = c.get(f"/api/portals/{P}/map").json()
        missing = c.get("/api/portals/nowhere/map")
    assert body["has_model"] is False and body["nodes"] == [] and body["edges"] == []
    assert missing.status_code == 404


def test_a_screens_actions_say_where_they_go(empty_store: Store) -> None:
    seed(empty_store)
    model(empty_store)
    with client(empty_store) as c:
        home = c.get(f"/api/portals/{P}/screens/SC-0001").json()
    assert home["actions"] and {a["place"] for a in home["actions"]} == {"out"}
