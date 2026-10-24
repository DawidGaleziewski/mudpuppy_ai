"""The React console's Screens API (R-96, spec 052): the model's screens with mapped statuses and
the filters; one screen with what needs you, variants, actions and history."""

from __future__ import annotations

from .conftest import Store
from .test_changes import P
from .test_model_screens import seed_screens
from .test_processes_pages import client


def test_screens_list_needs_you_first_with_mapped_statuses(empty_store: Store) -> None:
    seed_screens(empty_store)
    with client(empty_store) as c:
        body = c.get(f"/api/portals/{P}/screens").json()
        retired = c.get(f"/api/portals/{P}/screens?status=retired").json()
        by_text = c.get(f"/api/portals/{P}/screens?q=promo").json()
    assert body["has_model"] is True
    assert body["counts"] == {"active": 1, "retired": 1}
    first = body["screens"][0]
    assert [s["key"] for s in body["screens"]] == ["SC-0001", "SC-0002"]  # needs you first
    assert first["status"] == {"shape": "live", "word": "Active"}
    assert first["needs"] == 4 and {"word": "Release", "variant": None} in first["why"]
    assert (first["checked"], first["actions"]) == (1, 2)
    assert body["screens"][1]["status"] == {"shape": "stopped", "word": "Retired"}
    assert [s["key"] for s in retired["screens"]] == ["SC-0002"]
    assert [s["key"] for s in by_text["screens"]] == ["SC-0002"]
    assert {"value": "needs", "label": "Needs you first"} in body["sorts"]


def test_each_row_has_its_main_variants_picture(empty_store: Store) -> None:
    """Designer T-03: the list shows r1's latest recording; a screen without one has none."""
    seed_screens(empty_store)
    shot = "a" * 64 + ".png"
    conn = empty_store.connect()
    conn.execute("UPDATE states SET screenshot_ref = ? WHERE id = 'st-a'", (shot,))
    conn.execute("UPDATE states SET screenshot_ref = ? WHERE id = 'st-b'", ("b" * 64 + ".png",))
    conn.commit()
    conn.close()
    with client(empty_store) as c:
        rows = {s["key"]: s for s in c.get(f"/api/portals/{P}/screens").json()["screens"]}
    assert rows["SC-0001"]["picture"] == {"shot": f"/evidence/{shot}", "wire": None}
    assert rows["SC-0002"]["picture"] is None


def test_an_unknown_why_or_sort_falls_back(empty_store: Store) -> None:
    seed_screens(empty_store)
    with client(empty_store) as c:
        body = c.get(f"/api/portals/{P}/screens?why=Nonsense&sort=nonsense").json()
    assert body["filter"]["why"] is None and body["filter"]["sort"] == "needs"
    assert len(body["screens"]) == 2


def test_a_screen_with_needs_variants_actions_and_history(empty_store: Store) -> None:
    seed_screens(empty_store)
    with client(empty_store) as c:
        d = c.get(f"/api/portals/{P}/screens/SC-0001").json()
        missing = c.get(f"/api/portals/{P}/screens/SC-0404")
    assert d["screen"]["key"] == "SC-0001"
    assert len(d["needs"]) > 0 and all("keys" in n for n in d["needs"])
    assert [v["ordinal"] for v in d["variants"]] == [1, 2]
    assert d["variants"][0]["reason"] == "Baseline"
    assert d["variants"][0]["status"] == {"shape": "ok", "word": "Observed"}
    untested = next(a for a in d["actions"] if a["element_key"] == "link|promo||")
    assert untested["status"] == {"shape": "todo", "word": "Not checked"}
    assert untested["leads_to"] == []
    assert len(d["history"]) == 6
    assert missing.status_code == 404
    assert missing.json()["detail"] == f"There is no screen SC-0404 in {P}."


def test_screens_of_an_unknown_portal_are_not_found(empty_store: Store) -> None:
    seed_screens(empty_store)
    with client(empty_store) as c:
        r = c.get("/api/portals/nowhere/screens")
    assert r.status_code == 404
    assert r.json()["detail"] == "There is no portal nowhere here."
