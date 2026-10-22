"""Home ▸ All portals (spec 040 T020, designer screen v2-15): a row per portal with its releases,
last scan, changes, what needs you and its processes; Review's preview across portals."""

from __future__ import annotations

import sqlite3

from pathfinder_dashboard import queries_all_portals

from .conftest import Store
from .test_changes import P
from .test_chat import text
from .test_model_screens import seed_screens
from .test_processes_pages import client


def test_a_row_per_portal_and_reviews_preview(empty_store: Store) -> None:
    seed_screens(empty_store)
    conn = empty_store.connect()
    conn.row_factory = sqlite3.Row
    every = queries_all_portals.all_portals(conn, [P, "empty-portal"])
    conn.close()
    row, empty = every.rows
    assert row.has_model and [(x.part, x.name) for x in row.releases] == [("Shell", "3e1a")]
    assert row.changes > 0 and row.review > 0 and row.processes == 1 and row.explored == 0
    assert not empty.has_model and empty.review == 0 and empty.last_scan is None
    assert len(every.preview) == 3 and all(p == P for p, _, _ in every.preview)
    ats = [it.at for _, _, it in every.preview]
    assert ats == sorted(ats, reverse=True)  # newest first
    with client(empty_store) as c:
        page = c.get("/?portal=").text
    flat = text(page)
    assert "Review across portals" in flat and "Review shows one portal at a time" in flat
    assert ">Portals</h2>" in page and "0 explored / 1 not" in flat
    assert page.count("sy-btn--primary") <= 1
