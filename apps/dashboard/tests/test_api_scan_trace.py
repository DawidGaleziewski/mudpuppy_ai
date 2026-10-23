"""The React console's Trace and Process (R-96, spec 056): the summary, the calls with the agent's
context, a call's phases and events as facts, a trace run's process with its map; empty and 404."""

from __future__ import annotations

from fastapi.testclient import TestClient

from .conftest import BIG_RUN, Store, make_client
from .seeds import seed_trace_with_events_and_agent


def _client(store: Store) -> TestClient:
    w = store.connect()
    seed_trace_with_events_and_agent(w)
    w.commit()
    w.close()
    return make_client(store)


def test_the_calls_carry_the_agents_context(liveinsurer_store: Store) -> None:
    with _client(liveinsurer_store) as c:
        summary = c.get(f"/api/scans/{BIG_RUN}/trace/summary").json()
        calls = c.get(f"/api/scans/{BIG_RUN}/trace").json()
        refused = c.get(f"/api/scans/{BIG_RUN}/trace?status=refused&status=").json()
    assert summary["has_trace"] is True and summary["calls"] >= 1
    assert summary["health"]["word"] and isinstance(summary["health_parts"], list)
    first = next(x for x in calls["items"] if x["id"] == "e-call-1")
    assert first["status"]["word"] == "Refused" and first["agent"]["imported"] is True
    assert first["agent"]["text"] == "Trying to buy the policy to see what happens"
    assert first["agent"]["tokens"] and " in / " in first["agent"]["tokens"]
    assert calls["unmatched"] and calls["unmatched"][0]["tool"].startswith("mcp__mudpuppy__")
    assert {"value": "refused", "label": "Refused"} in calls["status_options"]
    assert refused["filter"]["status"] == ["refused"]
    assert all(x["status"]["word"] == "Refused" for x in refused["items"])


def test_a_calls_events_come_as_facts(liveinsurer_store: Store) -> None:
    with _client(liveinsurer_store) as c:
        body = c.get("/api/spans/e-call-1/children").json()
        missing = c.get("/api/spans/nope/children")
    assert body["scan"] == BIG_RUN
    events = {e["name"]: e["detail"] for e in body["events"]}
    gate = {f["label"]: f["value"] for f in events["gate_decision"]["facts"]}
    assert gate["Verdict"] == "Skipped ceiling:mutating" and "Buy" in gate["Input"]
    robots = {f["label"]: f["value"] for f in events["robots_check"]["facts"]}
    assert robots["URL"] == "/admin/pixel.gif https://www.liveinsurer.example"
    assert events["decision"]["rule"] == "ceiling:mutating"
    stall = events["stabilization_timeout"]
    assert {f["value"] for f in stall["facts"]} >= {"3000 ms"}
    assert stall["lines"] == ["fetch /api/poll 4200 ms in flight"]
    fp = {f["label"]: f["value"] for f in events["fingerprint_assign"]["facts"]}
    assert fp["Similarity"] == "0.987 (threshold 0.900)"
    assert missing.status_code == 404


def test_no_trace_and_unknown_scans(client: TestClient) -> None:
    summary = client.get(f"/api/scans/{BIG_RUN}/trace/summary").json()
    calls = client.get(f"/api/scans/{BIG_RUN}/trace").json()
    assert summary["has_trace"] is False and calls["items"] == [] and calls["total"] == 0
    for path in ("trace", "trace/summary", "process"):
        assert client.get(f"/api/scans/nope/{path}").status_code == 404


def test_a_trace_runs_process_and_a_map_runs_none(ba_client: TestClient) -> None:
    trace = ba_client.get("/api/scans/run-trace/process").json()
    map_ = ba_client.get("/api/scans/run-map/process").json()
    p = trace["process"]
    assert p["name"] == "Buy a car policy" and p["outcome"]["word"] == "Boundary reached"
    assert p["observed_result"] == "Premium shown: 1 234 PLN" and p["not_observable"]
    assert trace["diagram"].startswith("flowchart TD")
    step = trace["steps"][1]
    assert step["intent"] == "Enter the car model" and step["value"] == "Octavia"
    assert step["outcomes"] == ["outcome 2"]
    assert map_ == {"process": None, "diagram": None, "steps": []}
