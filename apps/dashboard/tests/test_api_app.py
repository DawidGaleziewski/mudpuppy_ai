"""The React console's JSON API and the app's own route (R-96, spec 050)."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings
from mudpuppy_dashboard.stores import Store
from tests.conftest import insert


def _client(store: Store, tmp: Path, dist: Path | None = None) -> TestClient:
    portals = tmp / "portals"
    for name, env in (("shop", store.env), ("bank", "sandbox-other")):
        (portals / name).mkdir(parents=True)
        (portals / name / "portal.yaml").write_text(f"id: {name}\nenvironment: {env}\n")
    settings = Settings(
        data_dir=store.data_dir,
        default_env=store.env,
        portals_dir=portals,
        web_dist=dist or tmp / "no-build",
    )
    return TestClient(create_app(settings))


@pytest.fixture
def client(empty_store: Store, tmp_path: Path) -> Iterator[TestClient]:
    conn = empty_store.connect()
    insert(conn, "runs", id="run-1", portal_id="shop", status="completed", steps_used=12)
    conn.commit()
    conn.close()
    with _client(empty_store, tmp_path) as c:
        yield c


def test_portals_lists_this_stores_portals_with_counts(client: TestClient) -> None:
    body = client.get("/api/portals").json()
    assert [p["id"] for p in body["portals"]] == ["shop"]
    assert body["portals"][0]["scans"] == 1
    assert body["other_environments"] == ["bank"]


def test_scans_lists_a_portals_scans(client: TestClient) -> None:
    body = client.get("/api/portals/shop/scans").json()
    assert body["total"] == 1
    assert body["scans"][0]["id"] == "run-1"
    assert body["scans"][0]["steps_used"] == 12


def test_an_unknown_portal_is_not_found(client: TestClient) -> None:
    r = client.get("/api/portals/nowhere/scans")
    assert r.status_code == 404
    assert r.json()["detail"] == "There is no portal nowhere here."
    # a configured portal without scans is found, with none
    assert client.get("/api/portals/bank/scans").json()["total"] == 0


def test_home_gives_the_last_scan_with_a_mapped_status(client: TestClient) -> None:
    body = client.get("/api/portals/shop/home").json()
    assert body["portal"] == "shop"
    assert body["last_scan"]["id"] == "run-1"
    assert body["last_scan"]["status"] == {"shape": "ok", "word": "Completed"}
    assert body["needs"] == {"total": 0, "by_kind": [], "top": []}
    assert body["changes"]["by_process"] == []


def test_scans_carry_the_status_maps_shape_and_word(client: TestClient) -> None:
    status = client.get("/api/portals/shop/scans").json()["scans"][0]["status"]
    assert status == {"shape": "ok", "word": "Completed"}


def test_home_of_an_unknown_portal_is_not_found(client: TestClient) -> None:
    r = client.get("/api/portals/nowhere/home")
    assert r.status_code == 404
    assert r.json()["detail"] == "There is no portal nowhere here."
    # a configured portal without scans has a home, with no last scan
    assert client.get("/api/portals/bank/home").json()["last_scan"] is None


def test_the_app_route_without_a_build_says_how_to_make_one(client: TestClient) -> None:
    r = client.get("/app/")
    assert r.status_code == 404
    assert "pnpm --dir apps/web build" in r.text


def test_the_app_serves_files_and_falls_back_to_index(empty_store: Store, tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<div id=root></div>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    with _client(empty_store, tmp_path, dist) as c:
        assert c.get("/app/assets/app.js").text == "console.log(1)"
        assert c.get("/app/portals/shop/scans").text == "<div id=root></div>"
        # a path that leaves the build is never served (the app's index instead)
        assert c.get("/app/..%2F..%2F..%2Fetc%2Fpasswd").text == "<div id=root></div>"
        # R-100: hashed assets are cached for good, the page shell is asked for every time
        assert "immutable" in c.get("/app/assets/app.js").headers["cache-control"]
        assert c.get("/app/portals/shop").headers["cache-control"] == "no-cache"


def test_the_console_page_sends_a_content_security_policy(
    empty_store: Store, tmp_path: Path
) -> None:
    """R-94 (6): code and connections from this origin only; no plugins, no framing."""
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<div id=root></div>")
    with _client(empty_store, tmp_path, dist) as c:
        policy = c.get("/app/portals/shop").headers["content-security-policy"]
    rules = dict(part.strip().split(" ", 1) for part in policy.split(";"))
    assert rules["script-src"] == "'self'"
    assert rules["connect-src"] == "'self'"
    assert rules["object-src"] == "'none'"
    assert rules["frame-ancestors"] == "'none'"
