"""Observed revisions of a screen and amendment history (spec 022 M2, FE-S01)."""

from __future__ import annotations

import re

from pathfinder_dashboard import db, queries_revisions

from .conftest import Store, insert, make_client

T = "2026-10-1{}T10:00:00.000Z"


def seed(store: Store) -> None:
    conn = store.connect()
    for n, run in enumerate(("run-1", "run-2", "run-3"), start=1):
        insert(conn, "runs", id=run, portal_id="liveinsurer", started_at=T.format(n))
    insert(
        conn,
        "screens",
        id="scr-1",
        portal_id="liveinsurer",
        route_template="/oferty",
        cluster_id="c1",
        title="Oferty (nowe)",
        first_seen_run="run-1",
        created_at=T.format(1),
    )
    for sid, rev, run in (("st-r1", 1, "run-1"), ("st-r2", 2, "run-3")):
        insert(
            conn,
            "states",
            id=sid,
            portal_id="liveinsurer",
            fingerprint=f"fp-{sid}",
            cluster_id="c1",
            route_template="/oferty",
            title="Oferty",
            first_seen_run=run,
            created_at=T.format(rev),
            screen_id="scr-1",
            screen_rev=rev,
        )
    for run, sid in (("run-1", "st-r1"), ("run-2", "st-r1"), ("run-3", "st-r2")):
        insert(conn, "state_observations", run_id=run, state_id=sid, observed_at=T.format(2))
    conn.commit()
    conn.close()


def test_screen_of_state_lists_revisions_with_the_scans_that_saw_them(empty_store: Store) -> None:
    seed(empty_store)
    conn = db.connect(empty_store.data_dir, empty_store.env)
    s = queries_revisions.screen_of_state(conn, "st-r1")
    assert s is not None and s.screen.title == "Oferty (nowe)"
    assert [(r.rev, r.state_id, r.runs) for r in s.revisions] == [
        (1, "st-r1", ["run-1", "run-2"]),
        (2, "st-r2", ["run-3"]),
    ]
    assert s.latest() is not None and s.latest().state_id == "st-r2"  # type: ignore[union-attr]
    assert queries_revisions.screen_of_state(conn, "nope") is None


def test_state_page_shows_the_revision_strip(empty_store: Store) -> None:
    seed(empty_store)
    with make_client(empty_store, ui_salvage="all") as c:
        html = c.get("/states/st-r1").text
    assert re.search(r'href="/states/st-r1"\s+aria-current="page">r1', html)
    assert 'href="/states/st-r2"' in html and "latest" in html
    assert "seen by 2 scans" in html


def test_amendment_history_is_ordered_and_empty_without_rows(empty_store: Store) -> None:
    conn = db.connect(empty_store.data_dir, empty_store.env)
    assert queries_revisions.amendment_history(conn, "nope") == []
