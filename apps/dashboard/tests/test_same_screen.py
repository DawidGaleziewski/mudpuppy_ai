"""Same screen? (spec 039 T100, designer screen v2-14): the queue of pairs (conflicts first), one
pair side by side, and the answer forwarded to the chat service's label route."""

from __future__ import annotations

import json
import sqlite3

import httpx2

from pathfinder_dashboard import queries_same_screen

from .conftest import Store, ts
from .test_chat import ORIGIN, Service, text
from .test_map import P, model, seed
from .test_processes_pages import client


def labelled(store: Store, a: str, b: str, label: str, reason: str | None = None) -> None:
    conn = store.connect()
    conn.execute(
        "INSERT INTO state_pair_labels (portal_id, state_a, state_b, label, labelled_by,"
        " labelled_at, reason) VALUES (?, ?, ?, ?, 'Marek', ?, ?)",
        (P, a, b, label, ts(40), reason),
    )
    conn.commit()
    conn.close()


def pairs(store: Store, screen: str | None = None) -> list[tuple[str, str, bool]]:
    conn = store.connect()
    conn.row_factory = sqlite3.Row
    try:
        q = queries_same_screen.queue(conn, P, screen)
    finally:
        conn.close()
    return [(p.a.state_id, p.b.state_id, p.conflict) for p in q]


def test_each_screens_variants_are_asked_against_its_first_one(empty_store: Store) -> None:
    seed(empty_store)
    model(empty_store)
    assert sorted(pairs(empty_store)) == [("st-a", "st-ab", False), ("st-f1", "st-f1v", False)]
    assert pairs(empty_store, "SC-0003") == [("st-f1", "st-f1v", False)]


def test_a_label_the_model_disagrees_with_comes_first_and_an_agreeing_one_drops(
    empty_store: Store,
) -> None:
    seed(empty_store)
    model(empty_store)
    labelled(empty_store, "st-f1", "st-f1v", "distinct", "The error page is its own screen.")
    labelled(empty_store, "st-a", "st-ab", "near_duplicate")
    assert pairs(empty_store) == [("st-f1", "st-f1v", True)]


def test_the_page_shows_the_pair_the_conflict_and_three_answers(empty_store: Store) -> None:
    seed(empty_store)
    model(empty_store)
    labelled(empty_store, "st-f1", "st-f1v", "distinct", "The error page is its own screen.")
    with client(empty_store) as c:
        page = c.get(f"/same-screen?portal={P}")
        other = c.get(f"/same-screen?portal={P}&a=st-a&b=st-ab").text
        missing = c.get(f"/same-screen?portal={P}&a=st-a&b=nope")
    with client(empty_store) as fresh:  # no portal cookie yet
        none = fresh.get("/same-screen").text
    flat = text(page.text)
    assert page.status_code == 200 and "A label and the model disagree" in flat
    assert "Automatic grouping says same screen" in flat and "Marek labelled them different" in flat
    assert "The error page is its own screen." in flat and "1 of 2 · conflict" in flat
    assert page.text.count('name="answer"') == 3 and page.text.count("sy-btn--primary") == 1
    assert 'name="next_a" value="st-a"' in page.text
    assert "disagree" not in other and "2 of 2" in text(other)
    assert missing.status_code == 404
    assert "No portal chosen" in none


def test_an_answer_goes_to_the_chat_service_and_on_to_the_next_pair(empty_store: Store) -> None:
    seed(empty_store)
    model(empty_store)
    service = Service()
    service.routes[("POST", f"/portals/{P}/model/label")] = httpx2.Response(201, json={})
    with client(empty_store, service) as c:
        r = c.post(
            f"/same-screen/{P}?portal={P}",
            data={
                "a": "st-a",
                "b": "st-ab",
                "answer": "same_data",
                "why": "price only",
                "next_a": "st-f1",
                "next_b": "st-f1v",
            },
            headers=ORIGIN,
            follow_redirects=False,
        )
        bad = c.post(
            f"/same-screen/{P}?portal={P}",
            data={"a": "st-a", "b": "st-ab", "answer": "maybe"},
            headers=ORIGIN,
            follow_redirects=False,
        )
        foreign = c.post(f"/same-screen/{P}", data={"a": "x"}, follow_redirects=False)
    sent = json.loads(service.requests[-1].content)
    assert sent == {"a": "st-a", "b": "st-ab", "answer": "same_data", "by": "Anna",
                    "reason": "price only"}  # fmt: skip
    assert r.status_code == 303 and "a=st-f1" in r.headers["location"]
    assert "Saved" in r.headers["location"]
    assert "a=st-a" in bad.headers["location"] and "Pick" in bad.headers["location"]
    assert foreign.status_code == 403
