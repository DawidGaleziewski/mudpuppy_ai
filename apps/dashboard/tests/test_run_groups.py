"""Spec 034 R-70 (1): scans grouped by documented process; the model is shared with the BA server
(`apps/crawler/tests/fixtures/run-groups/cases.json`)."""

from __future__ import annotations

import json
from dataclasses import asdict

from mudpuppy_dashboard import queries_run_groups as q

from .conftest import Store, insert, make_client
from .paths import REPO_ROOT

CASES = json.loads(
    (REPO_ROOT / "apps/crawler/tests/fixtures/run-groups/cases.json").read_text(encoding="utf-8")
)


def test_matches_the_shared_case() -> None:
    inp = CASES["input"]
    got = q.group_runs(
        q.GroupInput(
            inp["runs"],
            inp["screens_of_run"],
            [q.GroupProcess(**p) for p in inp["processes"]],
        )
    )
    assert asdict(got) == CASES["expected"]


def test_page_lists_processes_unassigned_and_proposed(empty_store: Store) -> None:
    conn = empty_store.connect()
    for run in ("r-a", "r-b", "r-c"):
        insert(conn, "runs", id=run)
    for n, route in enumerate(("/a", "/b", "/c", "/d")):
        insert(
            conn,
            "states",
            id=f"s{n}",
            fingerprint=f"f{n}",
            first_seen_run="r-a",
            route_template=route,
        )
    for run, states in {"r-a": ["s0", "s1"], "r-b": ["s2", "s3"], "r-c": ["s2", "s3"]}.items():
        for s in states:
            insert(conn, "state_observations", run_id=run, state_id=s)
    conn.commit()
    conn.close()
    with make_client(empty_store) as c:
        c.cookies.set("pf_portal", "liveinsurer")
        html = c.get("/scans/by-process").text
    assert "Scans by process" in html and 'aria-current="page">By process' in html
    assert "In no process" in html and "Look like one process" in html
    assert html.count('href="/runs/r-b"') == 2  # unassigned and in the proposed group
    assert 'href="/runs/r-a"' in html


def test_page_without_a_portal_asks_for_one(empty_store: Store) -> None:
    with make_client(empty_store) as c:
        html = c.get("/scans/by-process").text
    assert "Pick a portal in the header" in html
