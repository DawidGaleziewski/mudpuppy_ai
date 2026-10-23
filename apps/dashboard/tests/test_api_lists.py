"""The React console's smaller lists (R-100, spec 071): Access by persona, Server activity,
Search, Scans by process."""

from __future__ import annotations

from pathlib import Path

from .conftest import Store, insert, make_client
from .test_access import load_fixture
from .test_access_pages import client as access_client
from .test_access_pages import personas_dir  # noqa: F401  (the fixture)


def test_access_lists_screens_by_persona_with_their_attributes(
    empty_store: Store,
    personas_dir: Path,  # noqa: F811
) -> None:
    fx = load_fixture(empty_store)
    a = access_client(empty_store, personas_dir).get("/api/portals/access-shop/access").json()
    assert [p for p, _ in a["personas"]] == fx["expected"]["personas"]
    assert dict(a["personas"])["basic"] == "tariff: basic"
    admin = next(r for r in a["rows"] if r["route"] == "/admin")
    assert sum(c is None for c in admin["cells"]) == 3  # basic, guest and premium never got there
    assert admin["status"]["word"] == "Differs"


def seed_scans(store: Store) -> None:
    conn = store.connect()
    for run in ("r-a", "r-b", "r-c"):
        insert(conn, "runs", id=run)
    for n, route in enumerate(("/a", "/b", "/c", "/d")):
        insert(
            conn,
            "states",
            id=f"s{n}",
            fingerprint=f"f{n}",
            first_seen_run="r-a",
            route_template=route,
            title=f"Strona {n}",
        )
    for run, states in {"r-a": ["s0", "s1"], "r-b": ["s2", "s3"], "r-c": ["s2", "s3"]}.items():
        for s in states:
            insert(conn, "state_observations", run_id=run, state_id=s)
    conn.commit()
    conn.close()


def test_scans_by_process_search_and_activity(empty_store: Store) -> None:
    seed_scans(empty_store)
    with make_client(empty_store) as c:
        groups = c.get("/api/portals/liveinsurer/scans/by-process").json()
        found = c.get("/api/search", params={"q": "Strona 2", "portal": "liveinsurer"}).json()
        nothing = c.get("/api/search", params={"q": ""}).json()
        activity = c.get("/api/activity").json()
    assert {s["id"] for s in groups["unassigned"]} == {"r-a", "r-b", "r-c"}
    assert [[s["id"] for s in g] for g in groups["proposed"]] == [["r-b", "r-c"]]
    assert [s["state"] for s in found["screens"]] == ["s2"] and found["total"] == 1
    assert nothing["total"] == 0
    assert activity == {"total": 0, "calls": [], "next_cursor": None}
