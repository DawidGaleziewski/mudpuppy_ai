"""Workbench stream (spec 043 T014, FR-004): the chat's events for the conversation come out as
out-of-band fragments with their ids (so a reconnect resumes from Last-Event-ID); the answer is
sent whole; a stored view re-renders its turn; the store's data needs no model."""

from __future__ import annotations

import json
from collections.abc import Iterator

import httpx2
import pytest
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store
from .test_wb_routes import CONV, PORTAL, seed_conversation


def sse(*events: tuple[int, str, dict]) -> bytes:
    return b"".join(
        f"id: {i}\nevent: {kind}\ndata: {json.dumps(data)}\n\n".encode() for i, kind, data in events
    )


class Upstream:
    def __init__(self, body: bytes) -> None:
        self.body = body
        self.last_ids: list[str | None] = []

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        if request.url.path.endswith("/events"):
            self.last_ids.append(request.headers.get("last-event-id"))
            return httpx2.Response(
                200, content=self.body, headers={"content-type": "text/event-stream"}
            )
        if request.url.path.endswith("/token"):
            return httpx2.Response(200, json={"token": "test-token-not-real"})
        return httpx2.Response(404, json={})


@pytest.fixture
def upstream() -> Upstream:
    return Upstream(
        sse(
            (5, "message_chunk", {"type": "message_chunk", "text": "Starting <b>a</b> scan."}),
            (6, "message_done", {"type": "message_done", "stopReason": "end_turn"}),
            (7, "wb_composing", {"type": "wb_composing", "turn": 1}),
            (
                8,
                "wb_view",
                {"type": "wb_view", "turn": 1, "viewId": "view-0001", "fallback": False},
            ),
        )
    )


@pytest.fixture
def client(empty_store: Store, upstream: Upstream) -> Iterator[TestClient]:
    seed_conversation(empty_store)
    settings = Settings(
        data_dir=empty_store.data_dir,
        default_env=empty_store.env,
        workbench=True,
        sse_max_s=1.5,
        poll_interval_s=0.2,
    )
    with TestClient(create_app(settings, chat_transport=httpx2.MockTransport(upstream))) as c:
        yield c


def read(client: TestClient, headers: dict[str, str] | None = None) -> str:
    with client.stream(
        "GET", f"/workbench/stream?c={CONV}&portal={PORTAL}", headers=headers or {}
    ) as r:
        assert r.status_code == 200
        return "".join(r.iter_text())


def test_words_come_out_as_fragments_with_their_ids(client: TestClient) -> None:
    out = read(client)
    assert "event: hello" in out
    assert "id: 6" in out
    assert 'id="turn-t1-text" hx-swap-oob="innerHTML"' in out
    assert "Starting &lt;b&gt;a&lt;/b&gt; scan." in out  # escaped, never markup
    assert "scan.Starting" not in out  # the answer is sent whole, once per flush
    assert 'data-gen-state="composing"' in out
    assert 'id="turn-t1-views" hx-swap-oob="innerHTML"' in out and 'id="t1-map"' in out


def test_a_reconnect_resumes_after_the_last_event(client: TestClient, upstream: Upstream) -> None:
    read(client, {"last-event-id": "4"})
    assert upstream.last_ids[0] == "4"
