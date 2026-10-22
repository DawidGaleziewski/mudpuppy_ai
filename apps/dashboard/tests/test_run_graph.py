"""Spec 035 (R-74): a scan's graph, where it failed and where it stopped, with the restarts of
screen 15 on the screen they belong to. Writes go through the chat service (mocked here)."""

from __future__ import annotations

import json
import sqlite3

from mudpuppy_dashboard import queries_run_graph

from .conftest import Store, insert
from .test_chat import ORIGIN
from .test_scan_plan import Chat, client, seed

T2 = "2026-10-17T02:00:00.000Z"


def seed_graph(store: Store) -> None:
    """The scan-plan seed (a stopped scan: Start → Oferty, "Dalej" failed on Oferty) with screens,
    an unreachable control on Start, and a second scan that completed without a failure."""
    seed(store)
    conn = store.connect()
    for sid, route, title in (("sc-home", "/", "Start"), ("sc-list", "/oferty", "Oferty")):
        conn.execute(
            "INSERT INTO screens (id, portal_id, route_template, cluster_id, title, first_seen_run,"
            " created_at) VALUES (?, 'liveinsurer', ?, ?, ?, 'run-1', ?)",
            (sid, route, f"c-{sid}", title, T2),
        )
    conn.execute("UPDATE states SET screen_id = 'sc-home' WHERE id = 'st-home'")
    conn.execute("UPDATE states SET screen_id = 'sc-list' WHERE id = 'st-list'")
    conn.execute(
        "UPDATE state_observations SET observed_at = ? WHERE state_id = 'st-list'", (T2,)
    )  # the list is seen after the start page
    conn.execute("UPDATE transitions SET status = 'executed'")
    insert(
        conn,
        "frontier",
        id="fr-1",
        run_id="run-1",
        state_id="st-home",
        status="unreachable",
        reason="control not found again",
    )
    insert(conn, "frontier", id="fr-2", run_id="run-1", state_id="st-list", status="pending")
    insert(conn, "runs", id="run-2", status="completed")
    insert(conn, "state_observations", run_id="run-2", state_id="st-home", observed_at=T2)
    conn.commit()
    conn.close()


def test_graph_model_marks_failures_and_where_it_stopped(empty_store: Store) -> None:
    seed_graph(empty_store)
    conn = empty_store.connect()
    conn.row_factory = sqlite3.Row  # as the app's read connections
    g = queries_run_graph.run_graph(conn, "run-1")
    assert g is not None
    assert [(n.route, n.order, n.status) for n in g.nodes] == [
        ("/", 1, "failed"),  # a control not found again
        ("/oferty", 2, "failed"),  # "Dalej" failed
    ]
    home, oferty = g.nodes
    assert home.unreachable == 1 and oferty.queued == 1
    assert [(f.transition_id, f.label, f.error) for f in oferty.failures] == [
        ("e-bad", "Dalej", "selector not found")
    ]
    assert g.stopped and g.stop_node is oferty and oferty.stopped_here
    assert [n.route for n in g.path] == ["/", "/oferty"]
    assert oferty.y > home.y  # laid out from the start page down
    assert (g.failures, g.unreachable) == (1, 1)
    assert queries_run_graph.screen_count(conn, "run-1") == 2
    assert queries_run_graph.needs_attention(conn, "run-1")
    assert not queries_run_graph.needs_attention(conn, "run-2")
    assert queries_run_graph.run_graph(conn, "nope") is None
    conn.close()


def test_scan_page_opens_on_the_graph_when_something_failed(empty_store: Store) -> None:
    seed_graph(empty_store)
    with client(empty_store, Chat()) as c:
        failed = c.get("/runs/run-1").text
        fine = c.get("/runs/run-2").text
        picked = c.get("/runs/run-1", params={"tab": "graph", "node": "sc-home"}).text
    assert 'id="region-graph"' in failed and "Where it stopped" in failed
    assert "Stopped here" in failed and 'value="continue"' in failed  # Resume
    assert 'value="e-bad"' in failed and "Retry this path" in failed  # on the stop screen
    assert failed.count('class="sy-btn sy-btn--primary"') == 1
    assert 'id="region-graph"' not in fine  # a clean scan opens on its states
    assert "1 control the crawler could not find again" in picked
    assert 'value="e-bad"' not in picked.split('id="graph-inspector"')[1]


def test_restarts_from_the_graph_come_back_to_it(empty_store: Store) -> None:
    seed_graph(empty_store)
    chat = Chat()
    with client(empty_store, chat) as c:
        skip = c.post(
            "/scans/recover/run-1/skip",
            data={"transition_id": "e-bad", "from": "graph", "node": "sc-list"},
            headers=ORIGIN,
            follow_redirects=False,
        )
        mark = c.post(
            "/states/st-list/mark",
            data={"kind": "start", "action": "mark", "back": "/runs/run-1?tab=graph&node=sc-list"},
            headers=ORIGIN,
            follow_redirects=False,
        )
        refused = c.post(
            "/scans/plan/start",
            data={"run_type": "continue", "persona": "guest", "from": "graph", "node": "sc-list"},
            headers=ORIGIN,
            follow_redirects=False,
        )
    assert skip.status_code == 303
    assert skip.headers["location"].startswith("/runs/run-1?tab=graph&node=sc-list&note=Skipped")
    assert mark.headers["location"].startswith("/runs/run-1?tab=graph&node=sc-list&note=Marked")
    assert chat.calls[-1][:2] == ("POST", "/portals/liveinsurer/marks")
    assert chat.calls[-1][2]["kind"] == "start"
    # no parent scan in the form: back to the plan page, as before
    assert refused.headers["location"].startswith("/scans/plan")


def test_scan_history_counts_failures_and_links_the_graph(empty_store: Store) -> None:
    seed_graph(empty_store)
    with client(empty_store, Chat()) as c:
        html = c.get("/scans").text
    assert "Where it stopped" in html and "tab=graph" in html
    assert json.dumps("run-1")[1:-1] in html
