"""The React console's scan sections (R-96, spec 055): each htmx tab as typed JSON, statuses
mapped, paged by cursor at the dashboard's page size, filtered, 404 for an unknown scan."""

from __future__ import annotations

from fastapi.testclient import TestClient

from .conftest import BIG_RUN

API = f"/api/scans/{BIG_RUN}"


def test_states_forms_robots_network(client: TestClient) -> None:
    states = client.get(f"{API}/states").json()
    forms = client.get(f"{API}/forms").json()
    robots = client.get("/api/scans/run-001/robots").json()
    network = client.get(f"{API}/network").json()
    assert [s["title"] for s in states] == ["Kup ubezpieczenia"]
    assert states[0]["confidence"]["shape"] is not None and states[0]["picture"] is None
    assert len(forms) == 6 and (forms[0]["fields"] is not None or forms[0]["raw"] is not None)
    assert robots and robots[0]["outcome"]["word"] and robots[0]["host"] == "www.liveinsurer.example"
    assert network["total"] == 9 and network["next_cursor"] is None
    call = network["items"][0]
    assert call["status"]["word"] in ("OK", "Error") and call["method"]


def test_actions_are_paged_counted_and_filtered(client: TestClient) -> None:
    first = client.get(f"{API}/actions").json()
    second = client.get(f"{API}/actions", params={"cursor": first["next_cursor"]}).json()
    skipped = client.get(f"{API}/actions?allowed=0").json()
    nonsense = client.get(f"{API}/actions?safety_class=nope&allowed=maybe").json()
    assert first["total"] == 600 and len(first["items"]) == 25 and first["next_cursor"]
    assert {a["id"] for a in first["items"]}.isdisjoint({a["id"] for a in second["items"]})
    assert {c["also"]["word"] for c in first["counts"]} == {"Allowed", "Skipped"}
    assert skipped["filter"] == {"safety_class": None, "allowed": "0"}
    assert all(a["decision"]["word"] == "Skipped" for a in skipped["items"])
    assert skipped["items"][0]["skip_reason"] == "above ceiling read"
    assert nonsense["filter"] == {"safety_class": None, "allowed": None}
    assert nonsense["total"] == 600
    assert {o["value"] for o in first["safety_options"]} >= {"read", "mutating"}


def test_frontier_counts_and_status_filter(client: TestClient) -> None:
    every = client.get(f"{API}/frontier").json()
    queued = client.get(f"{API}/frontier?status=pending").json()
    assert sum(c["count"] for c in every["counts"]) == every["total"] == 600
    assert all(i["status"]["word"] == "Queued" for i in queued["items"])
    assert queued["filter"] == {"status": "pending"}
    assert {"value": "pending", "label": "Queued"} in every["status_options"]


def test_decisions_grouped_and_filtered(client: TestClient) -> None:
    every = client.get(f"{API}/decisions").json()
    rule = "robots:Disallow: *cHash*"
    by_rule = client.get(f"{API}/decisions", params={"rule": rule}).json()
    assert {"value": rule, "label": rule} in every["rule_options"]
    assert next(g for g in every["groups"] if g["rule"] == rule)["count"] == 6
    assert by_rule["total"] == 6 and all(d["rule"] == rule for d in by_rule["items"])
    assert by_rule["filter"] == {"kind": None, "rule": rule}


def test_docs_and_an_unknown_scan(client: TestClient) -> None:
    docs = client.get(f"{API}/docs").json()
    assert docs == {"items": [], "total": 0, "next_cursor": None}
    for tab in ("states", "actions", "frontier", "forms", "network", "robots", "decisions", "docs"):
        assert client.get(f"/api/scans/nope/{tab}").status_code == 404
