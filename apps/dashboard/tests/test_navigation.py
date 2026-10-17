"""R-71 (spec 034): 25 items a page with the total, filters over every item, and Prev / Next on
detail pages in the list they were opened from."""

from __future__ import annotations

import re
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from pathfinder_dashboard import pager

from .conftest import Store, insert, make_client

PORTAL = "liveinsurer"


def test_paginate_clamps_and_counts() -> None:
    items = list(range(60))
    p = pager.paginate(items, 3)
    assert (p.items[0], len(p.items), p.pages, p.first, p.last) == (50, 10, 3, 51, 60)
    assert pager.paginate(items, 99).page == 3  # past the end: the last page
    assert pager.paginate([], 2).first == 0 and pager.paginate([], 2).pages == 1
    assert pager.page_number("x") == 1 and pager.page_number("-4") == 1


def test_links_keep_page_one_short() -> None:
    p = pager.paginate(list(range(60)), 2)
    pl = pager.links(p, lambda n: f"/l?page={n}" if n else "/l")
    assert (pl.prev_url, pl.next_url) == ("/l", "/l?page=3")


@pytest.fixture
def many_screens(empty_store: Store) -> Iterator[TestClient]:
    conn = empty_store.connect()
    insert(conn, "runs", id="run-1")
    for n in range(30):
        insert(
            conn,
            "states",
            id=f"st-{n:02d}",
            fingerprint=f"fp-{n:02d}",
            first_seen_run="run-1",
            route_template=f"/page/{n:02d}",
            title=f"{'Kalkulator' if n % 3 == 0 else 'Strona'} {n:02d}",
        )
    conn.commit()
    conn.close()
    with make_client(empty_store) as c:
        c.cookies.set("pf_portal", PORTAL)
        yield c


def _rows(html: str) -> list[str]:
    return re.findall(r'<td><a class="sy-case-normal" href="/states/(st-\d+)\?', html)


def test_screens_page_shows_25_with_total_and_next(many_screens: TestClient) -> None:
    html = many_screens.get("/screens").text
    assert len(_rows(html)) == 25
    assert "1–25 of 30 · page 1 of 2" in html
    assert 'href="/screens?page=2" rel="next"' in html
    second = many_screens.get("/screens", params={"page": "2"}).text
    assert _rows(second) == [f"st-{n:02d}" for n in range(25, 30)]
    assert 'href="/screens" rel="prev"' in second


def test_screens_filter_covers_every_page(many_screens: TestClient) -> None:
    html = many_screens.get("/screens", params={"q": "kalk"}).text
    assert _rows(html) == [f"st-{n:02d}" for n in range(0, 30, 3)]
    assert "30</span> recorded screens" in html  # the portal's total stays in the head
    assert 'rel="next"' not in html  # 10 matches fit one page


def test_screen_page_walks_the_filtered_list(many_screens: TestClient) -> None:
    list_url = "/screens?q=kalk"
    html = many_screens.get("/states/st-03", params={"list": list_url}).text
    assert "2 of 10 in" in html
    assert 'href="/states/st-00?list=%2Fscreens%3Fq%3Dkalk" rel="prev"' in html
    assert 'href="/states/st-06?list=%2Fscreens%3Fq%3Dkalk" rel="next"' in html
    first = many_screens.get("/states/st-00", params={"list": list_url}).text
    disabled_prev = '<span class="sy-btn sy-btn--sm sy-btn--quiet" aria-disabled="true">← Prev'
    assert disabled_prev in first


def test_unknown_or_foreign_list_gives_no_neighbours(many_screens: TestClient) -> None:
    for bad in ("https://evil.example/screens", "//evil/screens", "/nowhere", "/screens?q=zzz"):
        html = many_screens.get("/states/st-03", params={"list": bad}).text
        assert "In this list" not in html
