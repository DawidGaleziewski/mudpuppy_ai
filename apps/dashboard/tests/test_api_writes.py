"""The React console's writes (R-96, spec 054): marks, Probe, Skip and restarts go to the chat
service (mocked here) with the htmx routes' bodies; another origin, no reviewer, an unknown
target and a refusal each answer `{ok: false, message}`."""

from __future__ import annotations

import httpx2
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store
from .test_chat import ORIGIN
from .test_map import seed as seed_map
from .test_run_graph import seed_graph
from .test_scan_plan import Chat, client


def test_a_screen_mark_and_a_probe_mark_go_to_the_chat_service(empty_store: Store) -> None:
    seed_map(empty_store)
    chat = Chat()
    with client(empty_store, chat) as c:
        start = c.post(
            "/api/states/st-home/marks", json={"kind": "start", "action": "mark"}, headers=ORIGIN
        )
        off = c.post(
            "/api/states/st-home/marks", json={"kind": "skip", "action": "remove"}, headers=ORIGIN
        )
        probe = c.post("/api/states/st-f1/probe-mark", json={"action": "mark"}, headers=ORIGIN)
    assert start.json() == {"ok": True, "message": "Marked Start here.", "href": None}
    assert off.json()["message"] == "Skip mark removed."
    assert probe.json()["ok"] is True
    assert chat.calls == [
        (
            "POST",
            "/portals/liveinsurer/marks",
            {"author": "Owner", "kind": "start", "target_kind": "state", "target_id": "st-home"},
        ),
        (
            "DELETE",
            "/portals/liveinsurer/marks",
            {"author": "Owner", "kind": "skip", "target_kind": "state", "target_id": "st-home"},
        ),
        (
            "POST",
            "/portals/liveinsurer/marks",
            {"author": "Owner", "kind": "probe", "target_kind": "form_step", "target_id": "fs-1"},
        ),
    ]


def test_writes_are_refused_without_origin_reviewer_or_target(empty_store: Store) -> None:
    seed_map(empty_store)
    chat = Chat()
    nobody = Settings(data_dir=empty_store.data_dir, default_env=empty_store.env, reviewer=None)
    with client(empty_store, chat) as c:
        foreign = c.post("/api/states/st-home/marks", json={"kind": "start", "action": "mark"})
        unknown = c.post(
            "/api/states/st-home/marks", json={"kind": "nope", "action": "mark"}, headers=ORIGIN
        )
        no_step = c.post("/api/states/st-home/probe-mark", json={"action": "mark"}, headers=ORIGIN)
    with TestClient(create_app(nobody, chat_transport=httpx2.MockTransport(chat))) as c:
        anonymous = c.post(
            "/api/states/st-home/marks", json={"kind": "start", "action": "mark"}, headers=ORIGIN
        )
    assert (foreign.status_code, unknown.status_code, no_step.status_code) == (403, 422, 422)
    assert anonymous.status_code == 409 and "MUDPUPPY_REVIEWER" in anonymous.json()["message"]
    assert chat.calls == []


def test_a_refusal_comes_back_with_its_message(empty_store: Store) -> None:
    seed_map(empty_store)

    def refuse(request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(400, json={"message": "that state is gone"})

    settings = Settings(data_dir=empty_store.data_dir, default_env=empty_store.env, reviewer="O")
    with TestClient(create_app(settings, chat_transport=httpx2.MockTransport(refuse))) as c:
        r = c.post(
            "/api/states/st-home/marks", json={"kind": "start", "action": "mark"}, headers=ORIGIN
        )
    assert r.status_code == 502
    assert r.json() == {"ok": False, "message": "Not recorded: that state is gone.", "href": None}


def test_skip_and_restarts_of_a_scan(empty_store: Store) -> None:
    seed_graph(empty_store)
    chat = Chat()
    with client(empty_store, chat) as c:
        skip = c.post("/api/scans/run-1/skip", json={"transition_id": "e-bad"}, headers=ORIGIN)
        not_failed = c.post("/api/scans/run-1/skip", json={"transition_id": "e-ok"}, headers=ORIGIN)
        resume = c.post("/api/scans/run-1/restart", json={"run_type": "continue"}, headers=ORIGIN)
        retry = c.post(
            "/api/scans/run-1/restart",
            json={"run_type": "retry", "transition_id": "e-bad", "variation": "wait_longer"},
            headers=ORIGIN,
        )
        bad = c.post("/api/scans/run-1/restart", json={"run_type": "focused"}, headers=ORIGIN)
    assert skip.json()["ok"] is True and not_failed.status_code == 422
    assert resume.json()["href"] == "/chat?conversation=conv-1"
    assert retry.json()["ok"] is True and bad.status_code == 422
    texts = [body["text"] for _, path, body in chat.calls if path.endswith("/messages")]
    assert '"run_type": "continue"' in texts[0] and '"parent_run_id": "run-1"' in texts[0]
    assert '"target_transition_id": "e-bad"' in texts[1] and '"wait_longer"' in texts[1]
    assert chat.calls[0][2]["target_kind"] == "transition"
