"""The React console's Plan next scan and Recover (R-100, spec 071): the marks that pre-fill a
scan, Start scan through the portal's conversation, and where a stopped scan can be picked up."""

from __future__ import annotations

from .conftest import Store
from .test_chat import ORIGIN
from .test_scan_plan import Chat, client, seed


def test_the_plan_lists_marks_by_kind_with_how_they_are_reached(empty_store: Store) -> None:
    seed(empty_store)
    with client(empty_store, Chat()) as c:
        p = c.get("/api/portals/liveinsurer/scans/plan").json()
    groups = {g["kind"]: g["marks"] for g in p["groups"]}
    assert p["total"] == 3
    assert groups["start"][0]["reach"] == "replays 1 step"
    assert groups["recheck"][0]["reach"] == "opens by its URL"
    assert groups["skip"][0]["state"] is None  # an action, not a screen
    assert [t["value"] for t in p["types"]] == ["focused", "recheck", "retry"]


def test_start_scan_asks_the_assistant_and_points_at_the_drawer(empty_store: Store) -> None:
    seed(empty_store)
    chat = Chat()
    with client(empty_store, chat) as c:
        ok = c.post(
            "/api/portals/liveinsurer/scans/plan",
            json={"run_type": "focused", "persona": "guest", "environment": "sandbox", "depth": 1},
            headers=ORIGIN,
        )
        bad = c.post("/api/portals/liveinsurer/scans/plan", json={"run_type": "x"}, headers=ORIGIN)
    assert ok.json()["href"] == "/app/portals/liveinsurer?assistant=open"
    _, path, body = chat.calls[1]
    assert path == "/conversations/conv-1/messages"
    assert '"run_type": "focused", "plan": {"depth": 1}' in body["text"]
    assert bad.status_code == 422


def test_recovery_says_where_it_stopped_and_what_failed(empty_store: Store) -> None:
    seed(empty_store)
    with client(empty_store, Chat()) as c:
        r = c.get("/api/scans/run-1/recovery").json()
        missing = c.get("/api/scans/nope/recovery")
    assert r["failure_class"] == "crawler error" and r["status"]["word"]
    assert [(f["transition"], f["error"]) for f in r["failed"]] == [("e-bad", "selector not found")]
    assert r["last_state"] is not None
    assert missing.status_code == 404
