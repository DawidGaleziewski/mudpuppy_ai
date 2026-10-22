"""Spec 034 R-66: marks from the map inspector, the Plan next scan page (screen 14) and a stopped
scan's recovery (screen 15). Writes go through the chat service (mocked here)."""

from __future__ import annotations

import json

import httpx2
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings
from mudpuppy_dashboard.web.plan import scan_request_text

from .conftest import Store, insert
from .test_chat import ORIGIN

T = "2026-10-17T01:00:00.000Z"


class Chat:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict]] = []

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        body = json.loads(request.content or b"{}")
        self.calls.append((request.method, request.url.path, body))
        if request.url.path == "/conversations":
            return httpx2.Response(201, json={"id": "conv-1"})
        return httpx2.Response(201, json={"id": "x", "created": True})


def client(store: Store, chat: Chat) -> TestClient:
    settings = Settings(data_dir=store.data_dir, default_env=store.env, reviewer="Owner")
    c = TestClient(create_app(settings, chat_transport=httpx2.MockTransport(chat)))
    c.cookies.set("pf_portal", "liveinsurer")
    return c


def seed(store: Store) -> None:
    """A stopped scan: the start page (opened by URL), a list reached by a click, a failed press."""
    conn = store.connect()
    insert(conn, "runs", id="run-1", status="interrupted")
    for sid, route, title in (("st-home", "/", "Start"), ("st-list", "/oferty", "Oferty")):
        insert(
            conn,
            "states",
            id=sid,
            fingerprint=f"fp-{sid}",
            first_seen_run="run-1",
            route_template=route,
            title=title,
        )
        insert(conn, "state_observations", run_id="run-1", state_id=sid, observed_at=T)
    insert(
        conn,
        "observations",
        id="v-1",
        run_id="run-1",
        state_id="st-home",
        via="navigate",
        url="https://x.test/",
        created_at=T,
    )
    conn.execute(
        "INSERT INTO checkpoints (id, run_id, state_id, start_url, steps_json, created_at,"
        " updated_at) VALUES ('cp-1', 'run-1', 'st-list', 'https://x.test/', ?, ?, ?)",
        (json.dumps([{"action_id": "a-1", "value": None, "to_state": "st-list"}]), T, T),
    )
    insert(
        conn,
        "transitions",
        id="e-ok",
        run_id="run-1",
        from_state="st-home",
        to_state="st-list",
        action_json=json.dumps({"role": "link", "accessible_name": "oferty"}),
    )
    insert(
        conn,
        "transitions",
        id="e-bad",
        run_id="run-1",
        from_state="st-list",
        to_state=None,
        action_json=json.dumps({"role": "button", "accessible_name": "Dalej"}),
        error=json.dumps({"message": "selector not found"}),
    )
    for mid, kind, tk, tid in (
        ("m-1", "start", "state", "st-list"),
        ("m-2", "skip", "transition", "e-ok"),
        ("m-3", "recheck", "state", "st-home"),
    ):
        insert(
            conn, "marks", id=mid, portal_id="liveinsurer", kind=kind, target_kind=tk, target_id=tid,
            created_by="Owner", created_at=T,
        )  # fmt: skip
    conn.commit()
    conn.close()


def test_scan_request_text_names_the_exact_call() -> None:
    text = scan_request_text("liveinsurer", "guest", "sandbox", "focused", {"depth": 2})
    assert "request_scan with" in text
    assert '"run_type": "focused"' in text and '"plan": {"depth": 2}' in text
    assert '"environment": "sandbox"' in text


def test_plan_page_lists_marks_with_how_they_are_reached(empty_store: Store) -> None:
    seed(empty_store)
    with client(empty_store, Chat()) as c:
        html = c.get("/scans/plan").text
    assert "Plan next scan" in html and "3</span>" not in html.split("<h1")[0]
    assert "replays 1 step" in html  # the list, by its checkpoint
    assert "opens by its URL" in html  # the start page, opened directly
    assert "“oferty” on Start" in html  # the Skip mark on an action
    assert html.count('class="sy-btn sy-btn--primary"') == 1


def test_start_scan_asks_the_assistant_in_the_portal_conversation(empty_store: Store) -> None:
    seed(empty_store)
    chat = Chat()
    with client(empty_store, chat) as c:
        r = c.post(
            "/scans/plan/start",
            data={
                "run_type": "focused",
                "persona": "guest",
                "environment": "sandbox",
                "depth": "1",
            },
            headers=ORIGIN,
            follow_redirects=False,
        )
    assert r.status_code == 303 and r.headers["location"].startswith("/chat?conversation=conv-1")
    assert chat.calls[0] == ("POST", "/conversations", {"portal": "liveinsurer"})
    _, path, body = chat.calls[1]
    assert path == "/conversations/conv-1/messages"
    assert '"run_type": "focused", "plan": {"depth": 1}' in body["text"]


def test_recovery_page_offers_resume_retry_and_skip(empty_store: Store) -> None:
    seed(empty_store)
    chat = Chat()
    with client(empty_store, chat) as c:
        html = c.get("/scans/recover/run-1").text
        assert "Pick up scan run-1" in html and "Last good screen" in html
        assert "Dalej" in html and "selector not found" in html and "crawler error" in html
        assert 'name="target_transition_id" value="e-bad"' in html
        r = c.post(
            "/scans/recover/run-1/skip",
            data={"transition_id": "e-bad"},
            headers=ORIGIN,
            follow_redirects=False,
        )
        assert r.status_code == 303
        refused = c.post(
            "/scans/recover/run-1/skip",
            data={"transition_id": "e-ok"},
            headers=ORIGIN,
            follow_redirects=False,
        )
    assert (
        "POST",
        "/portals/liveinsurer/marks",
        {"author": "Owner", "kind": "skip", "target_kind": "transition", "target_id": "e-bad"},
    ) in chat.calls
    assert "Not+recorded" in refused.headers["location"]  # not a failed action of this scan


def test_inspector_mark_goes_through_the_chat_service(empty_store: Store) -> None:
    seed(empty_store)
    chat = Chat()
    with client(empty_store, chat) as c:
        r = c.post(
            "/states/st-list/mark",
            data={"kind": "focus", "action": "mark", "back": "/map"},
            headers=ORIGIN,
            follow_redirects=False,
        )
        bad = c.post(
            "/states/st-list/mark",
            data={"kind": "probe", "action": "mark"},
            headers=ORIGIN,
            follow_redirects=False,
        )
    assert r.status_code == 303 and r.headers["location"].startswith("/map?probe_note=Marked")
    assert (
        "POST",
        "/portals/liveinsurer/marks",
        {"author": "Owner", "kind": "focus", "target_kind": "state", "target_id": "st-list"},
    ) in chat.calls
    assert "Unknown" in bad.headers["location"]
