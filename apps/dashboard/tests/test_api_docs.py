"""The React console's Docs, part 1 (R-96, spec 066): the same sections, counts, records,
filters, pages and diagrams as the htmx Docs, statuses mapped."""

from __future__ import annotations

from fastapi.testclient import TestClient

from .conftest import Store, make_client

P = "reference-insurer"
API = f"/api/portals/{P}/docs"


def test_the_overview_has_the_sections_statuses_and_sessions(ba_client: TestClient) -> None:
    body = ba_client.get(API).json()
    assert body["section"]["id"] == "overview" and body["records"] is None
    labels = [s["label"] for s in body["sections"]]
    assert labels[0] == "Overview" and labels[-1] == "Traceability"
    processes = next(s for s in body["sections"] if s["id"] == "processes")
    assert processes["count"] == 3
    assert {s["id"] for s in body["counts"]}.isdisjoint({"overview", "traceability"})
    assert body["statuses"] and all(s["status"]["word"] for s in body["statuses"])
    sess = next(s for s in body["sessions"] if s["id"] == "sess-2")
    assert sess["summary"] == "summary of sess-2" and sess["status"]["word"]
    assert sess["href"] == f"/app/portals/{P}/docs/sessions/sess-2"
    assert ba_client.get(f"{API}?section=nope").json()["section"]["id"] == "overview"


def test_a_section_lists_its_records_with_filters(ba_client: TestClient) -> None:
    body = ba_client.get(f"{API}?section=processes&kind=use_case").json()
    r = body["records"]
    assert [x["key"] for x in r["items"]] == ["UC-001"] and r["filters"]["kind"] == "use_case"
    assert {o["value"] for o in r["filters"]["kinds"]} == {"process", "use_case"}
    uc = r["items"][0]
    assert uc["kind"] == "use case" and uc["status"]["word"] and uc["confidence"]["word"]
    assert uc["href"].startswith(f"/app/portals/{P}/docs/UC-001?list=%2Fdocs%2F{P}")
    assert "section%3Dprocesses" in uc["href"] and "kind%3Duse_case" in uc["href"]
    flagged = ba_client.get(f"{API}?section=processes&flag=not_observable").json()["records"]
    keys = [x["key"] for x in flagged["items"]]
    assert "PROC-001" in keys and "PROC-002" not in keys
    proc = next(x for x in flagged["items"] if x["key"] == "PROC-001")
    assert proc["not_observable"] == {"shape": "unobserved", "word": "Not observed"}
    rules = ba_client.get(f"{API}?section=rules&status=bogus").json()["records"]
    assert rules["filters"]["status"] is None and rules["filters"]["kinds"] == []


def test_traceability_lists_evidence_and_linked_records(ba_client: TestClient) -> None:
    r = ba_client.get(f"{API}?section=traceability").json()["records"]
    assert r["matrix"]
    req = next(x for x in r["items"] if x["key"] == "REQ-001")
    assert "CAP-001" in req["related"] and req["evidence"] >= 1


def test_the_capability_and_screen_sections_have_their_diagram(ba_client: TestClient) -> None:
    cap = ba_client.get(f"{API}?section=capabilities").json()["diagram"]
    assert cap["source"].startswith("flowchart TB") and "subgraph CAP_001" in cap["source"]
    scr = ba_client.get(f"{API}?section=screens").json()["diagram"]
    assert scr["source"].startswith("flowchart LR")
    assert scr["caption"].startswith("Screen navigation")
    assert ba_client.get(f"{API}?section=requirements").json()["diagram"] is None


def test_pages_follow_the_cursor(ba_fixture: Store) -> None:
    with make_client(ba_fixture, page_size=1) as c:
        first = c.get(f"{API}?section=processes").json()["records"]
        assert len(first["items"]) == 1 and first["total"] == 3 and first["next_cursor"]
        second = c.get(f"{API}?section=processes&cursor={first['next_cursor']}").json()
    assert second["records"]["items"][0]["key"] != first["items"][0]["key"]


def test_an_unknown_portal_is_404(ba_client: TestClient) -> None:
    assert ba_client.get("/api/portals/nope/docs").status_code == 404
