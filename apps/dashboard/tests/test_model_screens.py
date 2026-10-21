"""Screens of the portal model (spec 039 T100, designer screens v2-06 / v2-07): the list with
variants and why, last seen, checked actions, part and process; one screen's page."""

from __future__ import annotations

from .conftest import Store, ts
from .test_changes import P, seed_process_and_releases
from .test_chat import text
from .test_processes_pages import client
from .test_review_queue import seed_queue


def seed_screens(store: Store) -> Store:
    """The queue's model (SC-0001 with two variants) plus a retired SC-0002, and two actions."""
    seed_queue(store)
    seed_process_and_releases(store)
    conn = store.connect()
    conn.execute(
        "INSERT INTO model_screens (id, key, portal_id, route_key, title, status,"
        " first_model_version, created_at) VALUES ('M2', 'SC-0002', ?, '/promo', 'Promocja',"
        " 'retired', 'mv1', ?)",
        (P, ts(1)),
    )
    for aid, el, status in (("a1", "button|dalej||", "active"), ("a2", "link|promo||", "untested")):
        conn.execute(
            "INSERT INTO action_classes (id, screen_id, element_key, kind, status,"
            " status_model_version) VALUES (?, 'M1', ?, 'click', ?, 'mv2')",
            (aid, el, status),
        )
    conn.commit()
    conn.close()
    return store


def test_the_list_shows_model_screens_needs_you_first(empty_store: Store) -> None:
    seed_screens(empty_store)
    with client(empty_store) as c:
        html = c.get(f"/screens?portal={P}").text
        retired = c.get(f"/screens?portal={P}&status=retired").text
        recorded = c.get(f"/screens?portal={P}&recorded=1").text
    flat = text(html)
    assert "1 active · 0 merged · 1 retired" in flat
    assert html.index(">SC-0001<") < html.index(">SC-0002<")  # needs you first
    assert "Needs you · 4" in flat and ">Release<" in html  # d1's variant came with a release
    assert "1 / 2" in flat and "Shell" in flat and "Oblicz składkę" in flat
    assert ">SC-0002<" in retired and ">SC-0001<" not in retired
    assert "recorded screen" in text(recorded)  # the pages the model is built from


def test_a_screen_page_shows_needs_variants_actions_and_history(empty_store: Store) -> None:
    seed_screens(empty_store)
    with client(empty_store) as c:
        r = c.get(f"/screens/SC-0001?portal={P}")
        missing = c.get(f"/screens/SC-0404?portal={P}")
    html, flat = r.text, text(r.text)
    assert r.status_code == 200 and "Needs you on this screen" in flat
    assert html.count("sy-plate--intent") == 1 and html.count("sy-btn--primary") == 1
    assert "Variants · 2" in flat and ">r1<" in html and ">r2<" in html
    assert ">Baseline<" in html and "1d77" in flat and "3e1a" in flat
    assert "button|dalej||" in flat and "Not checked" in flat and "not tried yet" in flat
    assert "History · 6" in flat and 'href="/changes/d1' in html
    assert missing.status_code == 404 and "Screen not found" in missing.text
