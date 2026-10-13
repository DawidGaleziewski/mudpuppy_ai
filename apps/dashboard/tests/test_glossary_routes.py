"""Glossary pages in the dashboard (spec 006, contracts/dashboard-ui.md)."""

from __future__ import annotations

import re
import shutil
from pathlib import Path

from fastapi.testclient import TestClient

from .conftest import Store, make_client

FIXTURE = Path(__file__).parent / "fixtures" / "glossary" / "docs"


def test_glossary_page_lists_every_entry(empty_client: TestClient) -> None:
    r = empty_client.get("/glossary")
    assert r.status_code == 200
    for anchor in ("frontier", "evidence", "business-rule", "status-codes", "run"):
        assert f'id="{anchor}"' in r.text
    assert "not the portal glossary" in r.text
    assert 'href="/glossary/pages/frontier"' in r.text


def test_glossary_nav_item(empty_client: TestClient) -> None:
    # The Salvage yard has no glossary tab: the header's "?" button (Help and glossary) opens it
    # from every page, and the glossary is not one of the portal sections.
    for url in ("/glossary", "/scans"):
        html = empty_client.get(url).text
        assert re.search(r'<a [^>]*href="/glossary"[^>]*aria-label="Help and glossary"', html), url
        nav = re.search(r'<nav class="sy-nav"[^>]*>.*?</nav>', html, re.S).group(0)
        assert ">Glossary<" not in nav, url
    assert '<h1 class="sy-h1">Glossary</h1>' in empty_client.get("/glossary").text


def test_glossary_filter(empty_client: TestClient) -> None:
    r = empty_client.get("/glossary", params={"q": "front"})
    assert r.status_code == 200
    assert 'id="frontier"' in r.text
    assert 'id="cluster"' not in r.text
    assert 'value="front"' in r.text


def test_glossary_filter_matches_labels(empty_client: TestClient) -> None:
    r = empty_client.get("/glossary", params={"q": "stabilization"})
    assert 'id="settled"' in r.text


def test_glossary_filter_no_match(empty_client: TestClient) -> None:
    r = empty_client.get("/glossary", params={"q": "zzzz-nothing"})
    assert r.status_code == 200
    assert "No term matches" in r.text


def test_long_page(empty_client: TestClient) -> None:
    r = empty_client.get("/glossary/pages/frontier")
    assert r.status_code == 200
    assert "The frontier, explained" in r.text
    assert 'href="/glossary#budget"' in r.text


def test_long_page_unknown(empty_client: TestClient) -> None:
    r = empty_client.get("/glossary/pages/nope")
    assert r.status_code == 404
    assert "Not found" in r.text


def test_env_param_kept(empty_store: Store) -> None:
    (empty_store.data_dir / "db" / "sandbox.sqlite").write_bytes(b"")
    with make_client(empty_store) as client:
        r = client.get("/glossary", params={"env": "sandbox"})
    assert 'href="/glossary/pages/frontier?store=main%3Asandbox"' in r.text


def test_broken_glossary_degrades(empty_store: Store, tmp_path: Path) -> None:
    docs = tmp_path / "docs"
    shutil.copytree(FIXTURE, docs)
    (docs / "glossary" / "glossary.yaml").write_text("entries: [unclosed\n")
    with make_client(empty_store, docs_dir=docs) as client:
        page = client.get("/glossary")
        assert page.status_code == 200
        assert "The glossary could not be loaded" in page.text
        assert "sy-state--failure" in page.text
        assert "invalid YAML" in page.text
        assert client.get("/").status_code == 200
        assert client.get("/glossary/pages/alpha-long").status_code == 404


def test_fixture_glossary_and_retired(empty_store: Store) -> None:
    with make_client(empty_store, docs_dir=FIXTURE) as client:
        r = client.get("/glossary")
    assert 'id="alpha"' in r.text
    assert "retired" in r.text
    assert 'href="#alpha"' in r.text
    assert "Last changed in R-22" in r.text


def test_markdown_is_not_raw_html(empty_store: Store) -> None:
    with make_client(empty_store, docs_dir=FIXTURE) as client:
        r = client.get("/glossary/pages/alpha-long")
    assert "<b>raw html stays text</b>" not in r.text
    assert "&lt;b&gt;raw html stays text&lt;/b&gt;" in r.text


# ---- tooltips and section intros (US2) ----------------------------------------------------------

TIP = re.compile(
    r'<span class="mp-term">(?P<label>[^<]+)<a class="sy-hint" href="/glossary#(?P<id>[a-z0-9-]+)" '
    r'title="(?P<short>[^"]+)" aria-label="What is [^"]+\?">\?</a></span>'
)


def tips(html: str) -> dict[str, str]:
    """label → term id for every tooltip (the "?" hint after a label) on the page."""
    return {m["label"]: m["id"] for m in TIP.finditer(html)}


def plain(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


def test_actions_tab_tooltips_and_rename(client: TestClient) -> None:
    from .test_routes import BIG_RUN

    html = client.get(f"/runs/{BIG_RUN}?tab=actions").text
    found = tips(html)
    assert found["Safety class"] == "safety-class"
    assert found["Top locator"] == "top-locator"
    assert found["Decision"] == "decision"
    assert ">Links to<" in html
    assert ">Target<" not in html
    # the run header intro: the term's short text and a "More" link to the glossary entry
    assert "One session of the crawler" in html
    assert re.search(r'<a href="/glossary#run" aria-label="More about [^"]+">More</a>', html)


def test_frontier_and_states_tooltips(client: TestClient) -> None:
    from .test_routes import BIG_RUN

    frontier = tips(client.get(f"/runs/{BIG_RUN}?tab=frontier").text)
    assert frontier["Frontier"] == "frontier"
    assert frontier["Priority"] == "priority-depth"
    states_html = client.get(f"/runs/{BIG_RUN}?tab=states").text
    states = tips(states_html)
    assert states["Cluster"] == "cluster"
    assert states["Stabilization"] == "settled"
    assert "One distinct condition of a portal screen" in states_html


def test_tooltips_carry_their_text_and_page_ids_stay_unique(client: TestClient) -> None:
    # The Salvage hint keeps its text in `title` (no per-tooltip element ids to collide), so the
    # old "tooltip ids are unique" check becomes: every hint has text, and no id repeats.
    from .test_routes import BIG_RUN

    html = client.get(f"/runs/{BIG_RUN}?tab=frontier").text
    shorts = [m["short"] for m in TIP.finditer(html)]
    assert shorts and all(s.strip() for s in shorts)
    ids = re.findall(r'\sid="([^"]+)"', html)
    assert len(ids) == len(set(ids))


def test_docs_record_tooltips(ba_client: TestClient) -> None:
    html = ba_client.get("/docs/reference-insurer/REQ-001").text
    found = tips(html)
    assert found["Target"] == "target"
    assert found["Revision history"] == "revision"
    assert found["Relations"] == "relations"


def test_docs_section_heading_tooltip(ba_client: TestClient) -> None:
    html = ba_client.get("/docs/reference-insurer", params={"section": "rules"}).text
    assert tips(html).get("Business rules") == "business-rule"


def test_no_tooltips_when_glossary_broken(liveinsurer_store: Store, tmp_path: Path) -> None:
    from .test_routes import BIG_RUN

    docs = tmp_path / "docs"
    shutil.copytree(FIXTURE, docs)
    (docs / "glossary" / "glossary.yaml").write_text("entries: [unclosed\n")
    with make_client(liveinsurer_store, docs_dir=docs) as client:
        html = client.get(f"/runs/{BIG_RUN}?tab=frontier").text
    assert 'class="mp-term"' not in html and 'class="sy-hint"' not in html
    assert "Frontier" in html


# ---- BA wiki (US3) ------------------------------------------------------------------------------


def test_wiki_index_lists_pages(empty_client: TestClient) -> None:
    r = empty_client.get("/glossary/wiki")
    assert r.status_code == 200
    assert r.text.count('href="/glossary/wiki/') == 14


def test_wiki_page_with_citations(empty_client: TestClient) -> None:
    r = empty_client.get("/glossary/wiki/business-rule")
    assert r.status_code == 200
    assert "Business Rules Analysis" in r.text
    assert "checked 2026-10-03" in plain(r.text)
    assert 'href="https://www.iiba.org/' in r.text


def test_wiki_page_unknown(empty_client: TestClient) -> None:
    assert empty_client.get("/glossary/wiki/nope").status_code == 404


def test_glossary_links_to_wiki(empty_client: TestClient) -> None:
    r = empty_client.get("/glossary")
    assert 'href="/glossary/wiki/business-rule"' in r.text
    assert 'href="/glossary/wiki"' in r.text


def test_wiki_markdown_has_no_raw_html(empty_store: Store) -> None:
    with make_client(empty_store, docs_dir=FIXTURE) as client:
        r = client.get("/glossary/wiki/beta-concept")
    assert r.status_code == 200
    assert "Beta in our own words" in r.text
    assert "Beta is a test. It has two sentences." in r.text


def test_entry_shows_last_change(empty_client: TestClient) -> None:
    html = empty_client.get("/glossary").text
    entry = re.search(r'<article class="sy-plate" id="frontier".*?</article>', html, re.S)
    assert entry and "Last changed in R-52, 2026-10-12" in plain(entry.group(0))
