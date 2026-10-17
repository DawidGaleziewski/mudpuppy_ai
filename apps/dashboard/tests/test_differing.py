"""Differing-states groups (spec 033 FR-022): the dashboard's reader gives the same groups as the
BA tool on the shared fixture (`apps/crawler/tests/fixtures/differing/differing-states.json`,
also checked by `mcp-server/tests/differing-states.test.ts`), and follows screen merges."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from pathfinder_dashboard import queries_differing

from .conftest import Store

FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "crawler"
    / "tests"
    / "fixtures"
    / "differing"
    / "differing-states.json"
)
ORDER = (
    "runs",
    "form_steps",
    "screens",
    "states",
    "state_observations",
    "edges",
    "network_calls",
    "probe_outcomes",
)


def seed(store: Store) -> dict:
    fx = json.loads(FIXTURE.read_text())
    conn = store.connect()
    for table in ORDER:
        for row in fx["rows"].get(table, []):
            cols = ", ".join(row)
            marks = ", ".join("?" for _ in row)
            conn.execute(f"INSERT INTO {table} ({cols}) VALUES ({marks})", tuple(row.values()))
    conn.commit()
    conn.close()
    return fx


def groups(store: Store, portal: str) -> list[dict]:
    conn = store.connect()
    conn.row_factory = sqlite3.Row
    try:
        found = queries_differing.differing_groups(conn, portal)
    finally:
        conn.close()
    return sorted(
        (
            {
                "key": g.key,
                "kind": g.kind,
                "outcomes": sorted(
                    (
                        {
                            "screen_id": o.screen_id,
                            "state_id": o.state_id,
                            "state_kind": o.state_kind,
                            "seen": o.seen,
                            "of": o.of,
                            "reproduced": o.reproduced,
                            "http_status": o.http_status,
                            "personas": sorted({s.persona for s in o.scans}),
                        }
                        for o in g.outcomes
                    ),
                    key=lambda o: o["screen_id"],
                ),
            }
            for g in found
        ),
        key=lambda g: g["key"],
    )


def test_the_reader_gives_the_groups_of_the_shared_fixture(empty_store: Store) -> None:
    fx = seed(empty_store)
    assert groups(empty_store, fx["portal_id"]) == fx["expected"]


def test_a_merged_screen_counts_as_its_target_so_its_group_goes(empty_store: Store) -> None:
    fx = seed(empty_store)
    conn = empty_store.connect()
    conn.execute("UPDATE screens SET merged_into = 'news-a' WHERE id = 'news-b'")
    conn.commit()
    conn.close()
    keys = [g["key"] for g in groups(empty_store, fx["portal_id"])]
    assert "route:/news" not in keys and "action:home:button:Calculate" in keys
