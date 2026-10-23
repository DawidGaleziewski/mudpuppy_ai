"""The React console's glossary and BA wiki (R-100, spec 071; spec 006)."""

from __future__ import annotations

import shutil
from pathlib import Path

from fastapi.testclient import TestClient

from .conftest import Store, make_client

FIXTURE = Path(__file__).parent / "fixtures" / "glossary" / "docs"


def test_the_glossary_lists_terms_by_group_and_filters(empty_client: TestClient) -> None:
    every = empty_client.get("/api/glossary").json()
    front = empty_client.get("/api/glossary", params={"q": "front"}).json()
    ids = {t["id"] for g in every["groups"] for t in g["terms"]}
    assert {"frontier", "evidence", "business-rule"} <= ids
    assert "not the portal glossary" in every["scope"]
    kept = {t["id"] for g in front["groups"] for t in g["terms"]}
    assert "frontier" in kept and "cluster" not in kept
    frontier = next(t for g in every["groups"] for t in g["terms"] if t["id"] == "frontier")
    assert frontier["page"] == {"id": "frontier", "title": frontier["page"]["title"]}


def test_a_long_page_and_its_links_to_the_console(empty_client: TestClient) -> None:
    page = empty_client.get("/api/glossary/pages/frontier").json()
    assert page["title"] and 'href="/app/glossary#budget"' in page["html"]
    assert empty_client.get("/api/glossary/pages/nope").status_code == 404


def test_the_wiki_and_a_wiki_page_with_its_sources(empty_store: Store) -> None:
    with make_client(empty_store, docs_dir=FIXTURE) as c:
        rows = c.get("/api/glossary/wiki").json()
        page = c.get(f"/api/glossary/wiki/{rows[0]['slug']}").json()
        long = c.get("/api/glossary/pages/alpha-long").json()
    assert rows[0]["sources"] >= 1
    assert page["citations"][0]["url"].startswith("https://")
    assert "<b>" not in long["html"]


def test_a_broken_glossary_says_why(empty_store: Store, tmp_path: Path) -> None:
    docs = tmp_path / "docs"
    shutil.copytree(FIXTURE, docs)
    (docs / "glossary" / "glossary.yaml").write_text("entries: [unclosed\n")
    with make_client(empty_store, docs_dir=docs) as c:
        g = c.get("/api/glossary").json()
        page = c.get("/api/glossary/pages/alpha-long")
    assert g["groups"] == [] and any("invalid YAML" in p for p in g["problems"])
    assert page.status_code == 404
