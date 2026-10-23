"""The React console's scan page (R-96, spec 054): the summary and tabs, and the graph with where
the scan stopped and what failed."""

from __future__ import annotations

from .conftest import Store
from .test_run_graph import seed_graph
from .test_scan_plan import Chat, client


def test_the_scan_head_has_its_facts_and_tabs(empty_store: Store) -> None:
    seed_graph(empty_store)
    with client(empty_store, Chat()) as c:
        head = c.get("/api/scans/run-1").json()
        calm = c.get("/api/scans/run-2").json()
        missing = c.get("/api/scans/nope")
    assert head["id"] == "run-1" and head["status"]["word"] == "Interrupted"
    assert head["tabs"][0] == {"id": "graph", "label": "Graph", "count": 2}
    assert "process" not in {t["id"] for t in head["tabs"]}
    assert {f["label"] for f in head["facts"]} >= {"Started (UTC)", "Duration", "Continues"}
    assert head["needs_attention"] is True and calm["needs_attention"] is False
    assert missing.status_code == 404


def test_the_scan_graph_says_where_it_stopped_and_what_failed(empty_store: Store) -> None:
    seed_graph(empty_store)
    with client(empty_store, Chat()) as c:
        g = c.get("/api/scans/run-1/graph").json()
        missing = c.get("/api/scans/nope/graph")
    assert [(n["route"], n["order"], n["state"]) for n in g["nodes"]] == [
        ("/", 1, "failed"),
        ("/oferty", 2, "failed"),
    ]
    home, oferty = g["nodes"]
    assert home["chips"] == [{"word": "1 not found", "variant": "fail"}]
    assert oferty["failures"][0]["transition"] == "e-bad" and oferty["stopped_here"]
    assert g["stop_node"] == oferty["id"] and g["path"] == [home["id"], oferty["id"]]
    assert g["open_node"] == oferty["id"]
    assert g["recovery"]["stopped"] is True and g["recovery"]["queued"] == 1
    assert g["variations"][0]["value"] == "none"
    assert missing.status_code == 404
