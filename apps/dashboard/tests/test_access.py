"""Spec 024 US2: the access read model against the fixture the BA tool is checked with too."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict
from typing import Any

from mudpuppy_dashboard import queries_access

from .conftest import Store, insert
from .paths import REPO_ROOT

FIXTURE = REPO_ROOT / "apps/crawler/tests/fixtures/access/three-personas.json"
TABLES = (
    "runs",
    "screens",
    "states",
    "state_observations",
    "actions",
    "analysis_sessions",
    "doc_records",
    "doc_revisions",
    "doc_evidence_links",
)


def reader(store: Store) -> sqlite3.Connection:
    conn = store.connect()
    conn.row_factory = sqlite3.Row
    return conn


def load_fixture(store: Store) -> dict[str, Any]:
    fx = json.loads(FIXTURE.read_text())
    conn = store.connect()
    for table in TABLES:
        for row in fx["rows"][table]:
            insert(conn, table, **{**fx["defaults"].get(table, {}), **row})
    conn.commit()
    conn.close()
    return fx


def test_matrix_matches_the_shared_fixture(empty_store: Store) -> None:
    fx = load_fixture(empty_store)
    conn = reader(empty_store)
    matrix = queries_access.access_matrix(conn, fx["portal_id"])
    one = queries_access.access_matrix(conn, fx["portal_id"], "sc-account")
    conn.close()
    assert asdict(matrix) == fx["expected"]
    assert [s.screen_id for s in one.screens] == ["sc-account"]
    assert asdict(one.screens[0]) == fx["expected"]["screens"][1]


def test_element_keys_and_an_unknown_portal(empty_store: Store) -> None:
    assert queries_access.element_key("button", "Export") == 'button "Export"'
    assert queries_access.element_key("menu", None) == "menu"
    conn = reader(empty_store)
    assert asdict(queries_access.access_matrix(conn, "nobody")) == {
        "portal_id": "nobody",
        "personas": [],
        "screens": [],
        "budget_limited": [],
    }
    conn.close()


def test_unexplained_leaves_out_what_a_record_explains(empty_store: Store) -> None:
    fx = load_fixture(empty_store)
    conn = reader(empty_store)
    open_items = queries_access.unexplained(queries_access.access_matrix(conn, fx["portal_id"]))
    conn.close()
    # Export (BR-001), Invoices (BR-004) and Admin's reach (OQ-001) are explained.
    assert [d.id for d in open_items] == ["sc-account|menu"]


def test_unexplained_lists_a_reach_difference_first(empty_store: Store) -> None:
    fx = load_fixture(empty_store)
    conn = empty_store.connect()
    conn.execute("UPDATE doc_records SET withdrawn = 1 WHERE key = 'OQ-001'")
    conn.commit()
    conn.close()
    conn = reader(empty_store)
    matrix = queries_access.access_matrix(conn, fx["portal_id"])
    conn.close()
    items = queries_access.unexplained(matrix)
    assert [d.id for d in items] == ["sc-account|menu", "sc-admin|"]
    assert items[1].element is None


def test_variant_diff_pairs_renamed_elements(empty_store: Store) -> None:
    load_fixture(empty_store)
    conn = empty_store.connect()
    common = {"action_json": "{}", "safety_class": "read", "allowed": 1, "role": "link"}
    for id_, state, run, name, at in (
        ("x-l", "st-acc-1", "run-basic", "Cart (0)", "2026-10-14T08:10:00.000Z"),
        ("x-r", "st-acc-2", "run-b2b", "Cart (1)", "2026-10-14T08:10:00.000Z"),
    ):
        insert(
            conn, "actions", id=id_, run_id=run, state_id=state, accessible_name=name,
            created_at=at, **common,
        )  # fmt: skip
    conn.commit()
    conn.close()
    conn = reader(empty_store)
    diff = queries_access.variant_diff(conn, "st-acc-2", "st-acc-1")
    home = queries_access.variant_diff(conn, "st-home-2", "st-home-1")
    conn.close()
    assert diff.only_left == ['menuitem "Invoices"', "menu"]
    assert diff.only_right == []
    assert diff.text_differs == [queries_access.TextDiffers('link "Cart (1)"', 'link "Cart (0)"')]
    assert diff.same == 1
    assert (home.only_left, home.only_right, home.same) == (['button "Export"'], [], 2)
