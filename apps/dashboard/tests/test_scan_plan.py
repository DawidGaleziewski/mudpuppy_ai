"""Spec 034 R-66: marks from the map inspector, the Plan next scan page (screen 14) and a stopped
scan's recovery (screen 15). Writes go through the chat service (mocked here)."""

from __future__ import annotations

import json

import httpx2
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings
from mudpuppy_dashboard.web.chat_writes import scan_request_text

from .conftest import Store, insert

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
