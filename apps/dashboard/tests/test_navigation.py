"""R-71 (spec 034): 25 items a page with the total; the pager the read models page with."""

from __future__ import annotations

from mudpuppy_dashboard import pager


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
