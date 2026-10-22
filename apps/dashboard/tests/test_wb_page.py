"""Workbench page and its beta switch (spec 043 T018, FR-018, FE-W01)."""

from __future__ import annotations

from .conftest import Store, make_client


def test_beta_off_hides_the_tab_and_redirects_home(empty_store: Store) -> None:
    with make_client(empty_store) as client:
        home = client.get("/")
        assert ">Workbench" not in home.text
        r = client.get("/workbench", follow_redirects=False)
        assert r.status_code == 303 and "notice=workbench-paused" in r.headers["location"]
        paused = client.get(r.headers["location"])
        assert "The Workbench is paused." in paused.text


def test_beta_on_shows_the_tab_with_its_chip_and_the_page(empty_store: Store) -> None:
    with make_client(empty_store, workbench=True) as client:
        home = client.get("/")
        assert '<span class="sy-chip sy-chip--dashed">beta</span>' in home.text
        assert "Pick a portal first" in client.get("/workbench").text
        page = client.get("/workbench?portal=liveinsurer")
        assert page.status_code == 200
        assert page.text.count("<h1") == 1
        assert 'aria-current="page">Workbench' in page.text
        assert "/static/salvage/css/genui.css" in page.text
        # First visit (WB-UI-41): the empty state and the starters, no stream yet.
        assert "Nothing composed yet" in page.text
        assert 'data-wb-suggest="Start a map scan"' in page.text
        assert "/workbench/stream" not in page.text
