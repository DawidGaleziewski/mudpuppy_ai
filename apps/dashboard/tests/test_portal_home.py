"""Home of one portal (spec 039 T100, designer screen v2-01): latest releases and the last scan,
Needs you with its top five, counts, and what changed by process."""

from __future__ import annotations

from .conftest import Store
from .test_changes import P, seed_process_and_releases
from .test_chat import text
from .test_processes_pages import client
from .test_review_queue import seed_queue


def test_home_shows_releases_needs_you_and_changes_by_process(empty_store: Store) -> None:
    seed_queue(empty_store)
    seed_process_and_releases(empty_store)
    with client(empty_store) as c:
        r = c.get(f"/?portal={P}", follow_redirects=False)
    html = r.text
    flat = text(html)
    assert r.status_code == 200 and '<h1 class="sy-h1 sy-case-normal">liveinsurer</h1>' in html
    assert "Latest releases" in flat and ">3e1a<" in html and "was 1d77" in flat
    assert "AI scan" in flat and "Plan a scan" in flat
    assert html.count("sy-plate--intent") == 1 and html.count("sy-btn--primary") == 1
    assert "Open Review (6)" in flat and "Findings 2" in flat and "Removals 2" in flat
    assert "Top 5" in flat and "Drivers under 18 are refused." in flat
    assert "What changed, by process" in flat and "Oblicz składkę" in flat
    assert 'href="/changes?process=PRC-001' in html


def test_home_without_a_model_says_so(empty_store: Store) -> None:
    with client(empty_store) as c:
        flat = text(c.get(f"/?portal={P}").text)
    assert "no portal model yet" in flat and "No scan yet" in flat
    assert "Open Review (0)" in flat and "Nothing needs you." in flat
