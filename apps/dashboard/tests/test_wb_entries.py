"""Workbench entries and usage (spec 043 T039, T040, D-10): Scans links a running scan to a new
Workbench conversation with the ask filled in; the drawer links to the Workbench; Settings shows
the day's turns against the cap. Only with the beta on."""

from __future__ import annotations

from pathlib import Path

import httpx2
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store, insert

RUN = "01a110d5-0000-7000-8000-000000000001"


def chat(request: httpx2.Request) -> httpx2.Response:
    if request.url.path == "/workbench/usage":
        return httpx2.Response(200, json={"turns_today": 7, "cap": 200})
    if request.url.path.startswith("/portals/"):
        return httpx2.Response(200, json={"environments": []})
    return httpx2.Response(200, json={})


def client_of(store: Store, beta: bool) -> TestClient:
    settings = Settings(data_dir=store.data_dir, default_env=store.env, workbench=beta)
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(chat)))


def test_a_running_scan_links_to_the_workbench(empty_store: Store) -> None:
    conn = empty_store.connect()
    insert(conn, "runs", id=RUN, status="running")
    conn.commit()
    conn.close()
    with client_of(empty_store, beta=True) as client:
        html = client.get("/scans?portal=liveinsurer").text
        assert "Watch in Workbench" in html
        assert "ask=Watch+scan+01a110d5." in html
        page = client.get("/workbench?portal=liveinsurer&new=1&ask=Watch+scan+01a110d5.").text
        assert ">Watch scan 01a110d5.</textarea>" in page
    with client_of(empty_store, beta=False) as client:
        assert "Watch in Workbench" not in client.get("/scans?portal=liveinsurer").text


def test_the_drawer_links_to_the_workbench_only_in_the_beta(empty_store: Store) -> None:
    with client_of(empty_store, beta=True) as client:
        assert "Continue in Workbench" in client.get("/?portal=liveinsurer").text
    with client_of(empty_store, beta=False) as client:
        assert "Continue in Workbench" not in client.get("/?portal=liveinsurer").text


def test_settings_show_the_day_s_turns(empty_store: Store, tmp_path: Path) -> None:
    portals = tmp_path / "portals" / "liveinsurer"
    portals.mkdir(parents=True)
    (portals / "portal.yaml").write_text("id: liveinsurer\n")
    settings = Settings(
        data_dir=empty_store.data_dir,
        default_env=empty_store.env,
        workbench=True,
        portals_dir=tmp_path / "portals",
    )
    with TestClient(create_app(settings, chat_transport=httpx2.MockTransport(chat))) as client:
        html = client.get("/portals/liveinsurer/settings").text
    assert "Assistant · Workbench" in html
    assert "7 of 200 turns used today." in html
