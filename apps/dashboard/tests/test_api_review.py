"""The React console's Review (R-96, spec 062): the three tabs, the groups as rows with mapped
statuses, filters, the selected item's detail with its neighbours; confirm, reject and Undo go to
the chat service signed, a record's review runs `docs:review` (stubbed here)."""

from __future__ import annotations

import json

import httpx2
import pytest

from mudpuppy_dashboard import review
from mudpuppy_dashboard.settings import Settings

from .conftest import PORTAL, Store
from .test_changes import P
from .test_chat import ORIGIN, Service
from .test_processes_pages import client
from .test_review_queue import seed_queue

API = f"/api/portals/{P}/review"


def test_needs_you_lists_the_groups_with_mapped_rows_and_the_first_item_selected(
    empty_store: Store,
) -> None:
    with client(seed_queue(empty_store)) as c:
        body = c.get(API).json()
    assert body["tab"] == "needs" and body["total"] == 6 and body["decides"] is True
    kinds = [g["kind"] for g in body["groups"]]
    assert kinds == ["findings", "rules", "removals", "processes"]
    rules = next(g for g in body["groups"] if g["kind"] == "rules")
    (rule,) = rules["rows"]
    assert rule["id"] == "H-0002" and rule["keys"] == ["H-0002"]
    assert rule["status"]["word"]  # mapped by the API, never in the app
    removals = next(g for g in body["groups"] if g["kind"] == "removals")
    assert removals["alike"][0]["count"] == 2  # one decision for both
    assert removals["decides"] is True
    assert next(g for g in body["groups"] if g["kind"] == "processes")["decides"] is False
    assert {o["value"] for o in body["empty_kinds"]} >= {"records", "suites"}
    assert body["selected"]["row"]["kind"] == "findings" and body["selected"]["in_react"] is True
    assert body["selected"]["link"]["label"] == "Before / after"
    assert body["selected"]["link"]["value"].startswith(f"/app/portals/{P}/changes/")
    assert body["neighbours"]["index"] == 1 and body["neighbours"]["total"] == 2
    assert body["filters"] is not None


def test_a_group_tab_lists_its_rows_and_selects_by_kind_and_id(empty_store: Store) -> None:
    with client(seed_queue(empty_store)) as c:
        rules = c.get(f"{API}?show=rules&select=rules:H-0002").json()
        processes = c.get(f"{API}?show=processes").json()
        records = c.get(f"{API}?show=records").json()
    assert [g["kind"] for g in rules["groups"]] == ["rules"]
    assert rules["selected"]["row"]["id"] == "H-0002"
    assert rules["selected"]["link"]["value"] == f"/app/portals/{P}/rules/H-0002"
    assert processes["selected"]["link"]["value"] == f"/app/portals/{P}/processes"
    (empty,) = records["groups"]
    assert empty["count"] == 0 and empty["empty"].startswith("No draft records wait.")
    assert records["selected"] is None


def test_explained_and_decided_tabs(empty_store: Store) -> None:
    with client(seed_queue(empty_store)) as c:
        decided = c.get(f"{API}?tab=decided").json()
        explained = c.get(f"{API}?tab=explained").json()
    assert decided["groups"] == [] and decided["decided"]
    row = decided["decided"][0]
    assert row["actor"] == "Anna" and row["reason"] == "Seen the release."
    assert row["status"]["word"]
    assert explained["explained_count"] == len(explained["explained"])


def test_unknown_portal_is_404(empty_store: Store) -> None:
    with client(seed_queue(empty_store)) as c:
        assert c.get("/api/portals/nowhere/review").status_code == 404


def test_decide_and_undo_are_signed_and_answer_the_undo(empty_store: Store) -> None:
    service = Service()
    service.routes[("POST", f"/portals/{P}/model/decide")] = httpx2.Response(
        201, json={"decision": "cmd-1", "decided": [{"key": "H-0005", "status": "rejected"}]}
    )
    service.routes[("POST", f"/portals/{P}/model/undo")] = httpx2.Response(
        201, json={"undone": [{"key": "H-0005", "status": "proposed"}]}
    )
    with client(seed_queue(empty_store), service) as c:
        rejected = c.post(
            f"{API}/decide",
            json={"keys": ["H-0005"], "action": "reject", "reason": "still there"},
            headers=ORIGIN,
        )
        no_reason = c.post(
            f"{API}/decide", json={"keys": ["H-0005"], "action": "reject"}, headers=ORIGIN
        )
        foreign = c.post(f"{API}/decide", json={"keys": ["H-0005"], "action": "confirm"})
        undone = c.post(f"{API}/undo", json={"decision": "cmd-1"}, headers=ORIGIN)
    assert rejected.json() == {
        "ok": True,
        "message": "Rejected: H-0005.",
        "href": None,
        "undo": "cmd-1",
    }
    assert no_reason.status_code == 422 and "needs a reason" in no_reason.json()["message"]
    assert foreign.status_code == 403
    assert undone.json()["message"] == "Undone: H-0005."
    sent = [json.loads(q.content) for q in service.requests if q.url.path.endswith("/decide")]
    assert sent == [
        {"keys": ["H-0005"], "decision": "reject", "by": "Anna", "reason": "still there"}
    ]
    undo_sent = [json.loads(q.content) for q in service.requests if q.url.path.endswith("/undo")]
    assert undo_sent == [{"decision": "cmd-1", "by": "Anna"}]


def test_a_record_review_runs_docs_review(
    ba_fixture: Store, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[dict[str, object]] = []

    def fake(settings: Settings, env: str, **kw: object) -> review.ReviewOutcome:
        calls.append(kw)
        return review.ReviewOutcome(200, True, {"ok": True})

    monkeypatch.setattr(review, "submit_review", fake)
    api = f"/api/portals/{PORTAL}/review"
    with client(ba_fixture) as c:
        page = c.get(f"{api}?show=records").json()
        record = page["selected"]
        key, rev = record["row"]["id"], record["rev"]
        ok = c.post(f"{api}/records/{key}", json={"action": "confirm", "rev": rev}, headers=ORIGIN)
        bare = c.post(
            f"{api}/records/{key}",
            json={"action": "reject", "rev": rev, "text": " "},
            headers=ORIGIN,
        )
        missing = c.post(
            f"{api}/records/NOPE-001", json={"action": "confirm", "rev": 1}, headers=ORIGIN
        )
    assert record["in_react"] is True and record["link"]["value"] == f"/docs/{PORTAL}/{key}"
    assert ok.json()["message"] == f"Recorded confirm on {key} revision {rev}."
    assert calls == [
        {"portal_id": PORTAL, "key": key, "rev_no": rev, "action": "confirm", "text": None}
    ]
    assert bare.status_code == 422
    assert missing.status_code == 404
