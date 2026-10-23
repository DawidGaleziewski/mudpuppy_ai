"""The React console's Docs, part 2 (R-96, spec 067): one record (facts, content blocks, evidence,
relations, revisions, the review panel, Prev / Next, a process's maps and Open in Processes) and
one analysis session, statuses mapped."""

from __future__ import annotations

import httpx2
from fastapi.testclient import TestClient

from .conftest import Store, add_session, make_client
from .test_chat import ORIGIN, Service

P = "reference-insurer"
API = f"/api/portals/{P}/docs"


def test_a_record_has_its_facts_content_and_session(ba_client: TestClient) -> None:
    r = ba_client.get(f"{API}/REQ-001").json()
    assert r["title"] == "Premium form requires the model"
    assert (r["status"]["word"], r["confidence"]["word"]) == ("Draft", "Inferred")
    assert (r["rev"], r["latest_rev"], r["confirmed_rev"], r["is_latest"]) == (2, 2, 1, True)
    assert r["session"]["href"] == f"/app/portals/{P}/docs/sessions/sess-2"
    texts = [b for b in r["blocks"] if b["type"] == "text"]
    assert any(b["strong"] and "require the field" in b["text"] for b in texts)
    code = next(b for b in r["blocks"] if b["type"] == "code")
    assert (
        code["caption"] == "Acceptance criteria" and "Given the calculator is open" in code["text"]
    )


def test_evidence_links_open_the_scan_section_at_the_target(ba_client: TestClient) -> None:
    ev = ba_client.get(f"{API}/REQ-001").json()["evidence"]
    hrefs = {e["href"] for e in ev}
    assert "/app/scans/run-map/forms#form-vehicle" in hrefs
    assert "/app/scans/run-trace/process#step-2" in hrefs
    record = next(e for e in ev if e["tag"] == "SCR-002")
    assert record["href"] == f"/app/portals/{P}/docs/SCR-002"
    form = next(e for e in ev if e["href"].endswith("#form-vehicle"))
    assert form["scan"]["href"] == "/app/scans/run-map" and form["scan_note"].startswith("map · ")


def test_relations_revisions_and_older_revision(ba_client: TestClient) -> None:
    r = ba_client.get(f"{API}/REQ-001").json()
    out = {x["key"]: x for x in r["relations"] if x["direction"] == "Out"}
    assert {"CAP-001", "BR-001"} <= set(out) and out["CAP-001"]["type"] == "refines"
    assert [h["rev"] for h in r["history"]] == [2, 1] and r["history"][0]["shown"]
    assert r["history"][1]["href"] == f"/app/portals/{P}/docs/REQ-001?rev=1"
    reviews = r["history"][1]["reviews"]
    assert reviews and reviews[0]["reviewer"] == "Test Reviewer"
    old = ba_client.get(f"{API}/REQ-001?rev=1").json()
    assert old["rev"] == 1 and not old["is_latest"] and old["panel"]["rev"] == 2
    assert not any(e["href"] and "form-vehicle" in e["href"] for e in old["evidence"])
    br = ba_client.get(f"{API}/BR-001").json()
    assert any(x["direction"] == "In" and x["key"] == "REQ-001" for x in br["relations"])


def test_the_review_panel_says_what_can_be_decided(ba_fixture: Store) -> None:
    with make_client(ba_fixture, reviewer=None) as c:
        off = c.get(f"{API}/REQ-001").json()["panel"]
    with make_client(ba_fixture, reviewer="Test Reviewer") as c:
        draft = c.get(f"{API}/REQ-001").json()["panel"]
        decided = c.get(f"{API}/BR-001").json()["panel"]
    assert not off["enabled"] and draft["enabled"] and draft["can_decide"]
    assert not decided["can_decide"] and decided["reviews"][0]["action"]["word"]


def test_prev_and_next_follow_the_list_it_was_opened_from(ba_client: TestClient) -> None:
    listed = ba_client.get(f"{API}?section=processes").json()["records"]["items"]
    assert (
        listed[0]["href"]
        == f"/app/portals/{P}/docs/PROC-001?list=%2Fdocs%2F{P}%3Fsection%3Dprocesses"
    )
    r = ba_client.get(f"{API}/PROC-001", params={"list": f"/docs/{P}?section=processes"}).json()
    nb = r["neighbours"]
    assert nb["label"] == "Processes and use cases" and nb["position"] == 1 and nb["total"] == 3
    assert nb["prev"] is None and nb["next"].startswith(f"/app/portals/{P}/docs/")
    assert nb["list"] == f"/app/portals/{P}/docs?section=processes"
    assert ba_client.get(f"{API}/PROC-001").json()["neighbours"] is None


def test_a_process_record_has_its_maps_and_opens_in_processes(ba_fixture: Store) -> None:
    with make_client(ba_fixture, reviewer="Test Reviewer") as c:
        proc = c.get(f"{API}/PROC-001").json()
        plain = c.get(f"{API}/PROC-002").json()
    (m,) = proc["variant_maps"]
    assert m["source"].startswith("flowchart TD") and m["scan"]["href"].endswith("/process")
    assert proc["process"]["export"] == f"/app/portals/{P}/processes/PROC-001/documentation"
    assert proc["process"]["can_open"] and plain["variant_maps"] == []
    service = Service()
    service.routes[("POST", f"/portals/{P}/processes/from-record")] = httpx2.Response(
        200, json={"process": {"key": "PRC-004"}, "existing": False}
    )
    from .test_processes_pages import client as chat_client

    with chat_client(ba_fixture, service) as c:
        r = c.post(
            f"/api/portals/{P}/processes/from-record",
            json={"record_key": "PROC-001"},
            headers=ORIGIN,
        )
    assert r.json()["ok"] and r.json()["href"].endswith("/processes/PRC-004?model=A")


def test_malformed_content_falls_back_to_json(ba_fixture: Store) -> None:
    w = ba_fixture.connect()
    w.execute("UPDATE doc_revisions SET content_json = '[1, 2]' WHERE id = 'CAP-001-r1'")
    w.execute(
        'UPDATE doc_revisions SET content_json = \'{"kind":"mystery","title":"t"}\''
        " WHERE id = 'SCR-001-r1'"
    )
    w.commit()
    with make_client(ba_fixture) as c:
        cap = c.get(f"{API}/CAP-001").json()["blocks"]
        scr = c.get(f"{API}/SCR-001").json()["blocks"]
    assert cap[0]["type"] == "code" and cap[0]["caption"] == "Content (unrecognised shape)"
    assert scr[0]["caption"] == "Content (mystery)"
    assert ba_client_missing(ba_fixture) == 404


def ba_client_missing(store: Store) -> int:
    with make_client(store) as c:
        return c.get(f"{API}/NOPE-404").status_code


def test_a_session_has_its_scans_passes_records_and_gaps(ba_fixture: Store) -> None:
    with make_client(ba_fixture) as c:
        s2 = c.get(f"{API}/sessions/sess-2").json()
        s1 = c.get(f"{API}/sessions/sess-1").json()
        w = ba_fixture.connect()
        add_session(w, "sess-empty", portal=P, status="running", passes=(), started=90)
        w.commit()
        empty = c.get(f"{API}/sessions/sess-empty").json()
        missing = c.get(f"{API}/sessions/nope").status_code
    assert s2["summary"] == "summary of sess-2" and s2["status"]["word"] == "Completed"
    assert {x["scan"]["href"] for x in s2["scans"]} == {
        "/app/scans/run-map",
        "/app/scans/run-trace",
    }
    assert {p["name"] for p in s2["passes"]} >= {"synthesis"}
    req = next(x for x in s2["written"] if x["key"] == "REQ-001")
    assert req["change"] == "revise" and req["href"] == f"/app/portals/{P}/docs/REQ-001"
    assert "Login pages not observable" in s1["gaps"]
    assert empty["scans"] == [] and empty["passes"] == [] and empty["written"] == []
    assert empty["status"]["word"] == "Running" and missing == 404
