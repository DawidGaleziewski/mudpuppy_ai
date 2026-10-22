"""Screens of the portal model (spec 039 T100, designer screens v2-06 / v2-07): the list with
variants and why, last seen, checked actions, part and process; one screen's page."""

from __future__ import annotations

from mudpuppy_dashboard import queries_model_screens
from mudpuppy_dashboard.queries_changes import Explanation

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


def test_variants_say_why_in_six_words_and_coverage_names_the_release(
    empty_store: Store,
) -> None:
    """Spec 040 FR-008 (Release · Persona · Error · A/B test · Data · Unknown) and FR-009
    ("checked 1 / 2 on 3e1a")."""
    seed_screens(empty_store)
    with client(empty_store) as c:
        page = c.get(f"/screens/SC-0001?portal={P}").text
        listing = text(c.get(f"/screens?portal={P}").text)
    assert ">Release 3e1a<" in page  # r2 came with release 3e1a
    assert "1 / 2 on 3e1a" in listing
    assert queries_model_screens.why_of(Explanation("Another persona", "", "")) == "Persona"
    assert queries_model_screens.why_of(Explanation("Something new", "", "")) == "Unknown"


def test_the_list_filters_by_part_and_why_and_sorts(empty_store: Store) -> None:
    """Spec 039 F-51: Part, a variant's why, and the sort."""
    seed_screens(empty_store)
    with client(empty_store) as c:
        html = c.get(f"/screens?portal={P}").text
        shell = c.get(f"/screens?portal={P}&part=Shell").text
        release = c.get(f"/screens?portal={P}&why=Release").text
        persona = text(c.get(f"/screens?portal={P}&why=Persona").text)
        by_key = c.get(f"/screens?portal={P}&sort=key&status=").text
    assert '<option value="Shell">Shell</option>' in html and 'name="sort"' in html
    assert ">SC-0001<" in shell and ">SC-0002<" not in shell  # SC-0002 was never seen
    assert ">SC-0001<" in release and ">SC-0002<" not in release
    assert "No screen matches" in persona and "Clear filters" in persona
    assert by_key.index(">SC-0001<") < by_key.index(">SC-0002<")
