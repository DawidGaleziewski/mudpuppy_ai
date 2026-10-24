"""Spec 075 (the R-96 spike): the live Workbench's WebSocket. On connect the shared state
(AG-UI STATE_SNAPSHOT: the scan's meter, pages, graph and narration, the command cards, the
choices), the A2UI surfaces (the turn's compiled view with its cards, the stage) and the messages;
the chat's words as AG-UI text events; the person's selection as a state delta; Confirm with a
token fetched at the time; an answer and a message to the chat service. Same origin only."""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import httpx2
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from mudpuppy_dashboard import wb_a2ui
from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store, insert
from .wb_conversation import CMD, CONV, ORIGIN, Chat, seed_conversation
from .wb_fixture import PORTAL, RUN

CHOICE = "0199a000-0000-7000-8000-00000000c401"
WS = f"/api/workbench/live/{CONV}/ws"
SSE = (
    b'id: 7\nevent: message_chunk\ndata: {"text": "It stopped "}\n\n'
    b'id: 8\nevent: message_chunk\ndata: {"text": "at /kontakt."}\n\n'
    b"id: 9\nevent: message_done\ndata: {}\n\n"
    b"id: 10\nevent: idle\ndata: {}\n\n"
)


class LiveChat(Chat):
    """The mocked chat service, with an event stream and the live actions."""

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        if request.url.path.endswith("/events"):
            return httpx2.Response(200, headers={"content-type": "text/event-stream"}, content=SSE)
        if request.url.path.endswith("/actions"):
            self.calls.append((request.method, request.url.path, json.loads(request.content)))
            return httpx2.Response(200, json={"ok": True})
        return super().__call__(request)


def _live(store: Store) -> None:
    seed_conversation(store)
    conn = store.connect()
    conn.execute("UPDATE chat_conversations SET goal = 'workbench-live' WHERE id = ?", (CONV,))
    choice = {"id": CHOICE, "turn": 1, "kind": "store", "question": "Which data store?"}
    at = "2026-10-06T10:46:01.000Z"
    insert(
        conn, "chat_messages", id="m-choice", conversation_id=CONV, seq=2, role="system",
        content=json.dumps(choice), tool_name="workbench_choice", created_at=at,
    )  # fmt: skip
    # the crawler gives every state its screen when it records it (record-state.ts)
    states = conn.execute("SELECT id, route_template, cluster_id, title FROM states").fetchall()
    for sid, route, cluster, title in states:
        insert(
            conn, "screens", id=f"scr-{sid}", portal_id=PORTAL, route_template=route,
            cluster_id=cluster, title=title, first_seen_run=RUN, created_at=at,
        )  # fmt: skip
        conn.execute("UPDATE states SET screen_id = ? WHERE id = ?", (f"scr-{sid}", sid))
    conn.commit()
    conn.close()


@pytest.fixture
def chat() -> LiveChat:
    return LiveChat()


@pytest.fixture
def live(empty_store: Store, chat: LiveChat) -> Iterator[TestClient]:
    _live(empty_store)
    settings = Settings(
        data_dir=empty_store.data_dir,
        default_env=empty_store.env,
        workbench=True,
        reviewer="dawid",
        workbench_command_envs=empty_store.env,
    )
    with TestClient(create_app(settings, chat_transport=httpx2.MockTransport(chat))) as c:
        yield c


def _until(socket: Any, done: Any, limit: int = 40) -> list[dict[str, Any]]:
    """Frames until `done(frames)` holds."""
    frames: list[dict[str, Any]] = []
    while not done(frames):
        assert len(frames) < limit, [f["type"] for f in frames]
        frames.append(socket.receive_json())
    return frames


def _of(frames: list[dict[str, Any]], kind: str, name: str | None = None) -> list[dict[str, Any]]:
    return [f for f in frames if f["type"] == kind and (name is None or f.get("name") == name)]


def test_a_socket_from_another_origin_or_for_a_beta_conversation_is_refused(
    live: TestClient, empty_store: Store
) -> None:
    with pytest.raises(WebSocketDisconnect), live.websocket_connect(WS) as s:
        s.receive_json()
    with (
        pytest.raises(WebSocketDisconnect),
        live.websocket_connect(WS, headers={"origin": "http://evil.example"}) as s,
    ):
        s.receive_json()
    conn = empty_store.connect()
    conn.execute("UPDATE chat_conversations SET goal = 'workbench' WHERE id = ?", (CONV,))
    conn.commit()
    conn.close()
    with pytest.raises(WebSocketDisconnect), live.websocket_connect(WS, headers=ORIGIN) as s:
        s.receive_json()


def test_connect_sends_the_state_the_surfaces_and_the_messages(live: TestClient) -> None:
    with live.websocket_connect(WS, headers=ORIGIN) as s:
        frames = _until(s, lambda fs: _of(fs, "MESSAGES_SNAPSHOT") and _of(fs, "CUSTOM", "a2ui"))
    assert [f["seq"] for f in frames] == list(range(1, len(frames) + 1))
    state = _of(frames, "STATE_SNAPSHOT")[0]["snapshot"]
    scan = state["scans"][RUN]
    meter = scan["meter"]
    assert (meter["status"], meter["at"]) == ("stopped", "/kontakt")
    assert meter["pages"] >= len(scan["pages"]) == 6
    assert [p["route"] for p in scan["pages"]][-1] == "/kontakt"
    assert scan["pages"][-1]["status"] == "failed"
    assert scan["stop"]["route"] == "/kontakt"
    assert scan["graph"]["nodes"] and all(
        {"x", "y", "route"} <= n.keys() for n in scan["graph"]["nodes"]
    )
    assert scan["narration"][-1]["text"] == "The scan stopped at /kontakt."
    assert state["live"] == RUN
    card = state["commands"][wb_a2ui.command_id(CMD)]
    assert card["commandId"] == CMD and card["state"] == "proposed" and "token" not in card
    choice = state["choices"][wb_a2ui.choice_id(CHOICE)]
    assert choice["kind"] == "store" and choice["answer"] is None
    assert any(o["value"].endswith(":sandbox") or o["value"] for o in choice["options"])
    a2ui = [m for f in _of(frames, "CUSTOM", "a2ui") for m in f["value"]]
    created = [m["createSurface"]["surfaceId"] for m in a2ui if "createSurface" in m]
    assert created == ["t1", "stage"]
    t1 = next(
        m["updateComponents"]["components"]
        for m in a2ui
        if m.get("updateComponents", {}).get("surfaceId") == "t1"
    )
    assert [(c["id"], c["component"]) for c in t1] == [
        ("root", "View"), ("map", "LiveMap"), ("story", "Narration"), ("err", "ErrorCard"),
        (wb_a2ui.command_id(CMD), "CommandCard"), (wb_a2ui.choice_id(CHOICE), "Choice"),
    ]  # fmt: skip
    assert t1[1]["data"] == {"path": f"/scans/{RUN}"}
    messages = _of(frames, "MESSAGES_SNAPSHOT")[0]["messages"]
    assert [(m["role"], m["turn"]) for m in messages] == [("user", 1), ("assistant", 1)]


def test_an_event_shows_its_fact_without_the_assistants_instructions(
    empty_store: Store, live: TestClient
) -> None:
    """R-104 (5): the `[event]` marker and what the assistant is told to do stay out of sight."""
    conn = empty_store.connect()
    insert(
        conn, "chat_messages", id="m-event", conversation_id=CONV, seq=50, role="system",
        content="[event] The person confirmed: Start a scan.\n\nSay in one line it is starting.",
        tool_name="workbench_event", created_at="2026-10-06T10:50:00.000Z",
    )  # fmt: skip
    conn.commit()
    conn.close()
    with live.websocket_connect(WS, headers=ORIGIN) as s:
        frames = _until(s, lambda fs: _of(fs, "MESSAGES_SNAPSHOT"))
    messages = _of(frames, "MESSAGES_SNAPSHOT")[0]["messages"]
    events = [m["content"] for m in messages if m["role"] == "system"]
    assert events == ["The person confirmed: Start a scan."]


def test_the_assistants_words_arrive_as_agui_text_and_run_events(live: TestClient) -> None:
    with live.websocket_connect(WS, headers=ORIGIN) as s:
        frames = _until(s, lambda fs: _of(fs, "RUN_FINISHED"))
    talk = [f for f in frames if f["type"].startswith(("TEXT_", "RUN_"))]
    assert [f["type"] for f in talk] == [
        "RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_CONTENT",
        "TEXT_MESSAGE_END", "RUN_FINISHED",
    ]  # fmt: skip
    assert (
        "".join(f["delta"] for f in _of(frames, "TEXT_MESSAGE_CONTENT"))
        == "It stopped at /kontakt."
    )
    assert talk[-1]["chatId"] == "10" and talk[0]["threadId"] == CONV


def test_selection_is_shared_state_and_rides_on_the_next_message(
    live: TestClient, chat: LiveChat
) -> None:
    with live.websocket_connect(WS, headers=ORIGIN) as s:
        _until(s, lambda fs: _of(fs, "STATE_SNAPSHOT"))
        pick = {"scan": RUN, "route": "/porownanie", "state": 1}
        s.send_json({"type": "action", "action": {"name": "page.select", "context": pick}})
        frames = _until(
            s,
            lambda fs: any(
                op["path"] == "/ui/selected" for f in _of(fs, "STATE_DELTA") for op in f["delta"]
            ),
        )
        s.send_json({"type": "say", "text": "Why did it stop?"})
        _until(s, lambda fs: any(c[1].endswith("/turns") for c in chat.calls))
    op = next(
        op for f in _of(frames, "STATE_DELTA") for op in f["delta"] if op["path"] == "/ui/selected"
    )
    assert op["value"] == pick
    *_, body = next(c for c in chat.calls if c[1].endswith("/turns"))
    assert body == {
        "text": "Why did it stop?",
        "ctx": [{"kind": "page", "scan": RUN, "route": "/porownanie"}],
        "by": "dawid",
    }


def test_confirm_takes_a_fresh_token_and_an_answer_names_the_whole_choice(
    live: TestClient, chat: LiveChat
) -> None:
    with live.websocket_connect(WS, headers=ORIGIN) as s:
        _until(s, lambda fs: _of(fs, "STATE_SNAPSHOT"))
        confirm = {"name": "command.confirm", "context": {"command": wb_a2ui.command_id(CMD)}}
        s.send_json({"type": "action", "action": confirm})
        answer = {"choice": wb_a2ui.choice_id(CHOICE), "value": "main:sandbox", "label": "Sandbox"}
        s.send_json({"type": "action", "action": {"name": "choice.answer", "context": answer}})
        s.send_json(
            {
                "type": "action",
                "action": {"name": "command.confirm", "context": {"command": "cmd-gone"}},
            }
        )
        frames = _until(s, lambda fs: _of(fs, "CUSTOM", "notice"))
    paths = [c[1] for c in chat.calls if c[0] == "POST"]
    assert paths[:2] == [f"/workbench/commands/{CMD}/token", f"/workbench/commands/{CMD}/confirm"]
    confirm_body = next(c[2] for c in chat.calls if c[1].endswith("/confirm"))
    assert confirm_body == {"by": "dawid", "token": "test-token-not-real"}
    sent = next(c[2] for c in chat.calls if c[1].endswith("/actions"))
    assert sent == {"name": "choice.answer", "context": {**answer, "choice": CHOICE}}
    assert _of(frames, "CUSTOM", "notice")[0]["value"] == {
        "tone": "failure",
        "text": "This card is out of date.",
    }


def test_the_live_page_lists_live_conversations_only(live: TestClient, chat: LiveChat) -> None:
    body = live.get(f"/api/workbench/live/portals/{PORTAL}").json()
    assert [r["id"] for r in body["recent"]] == [CONV]
    assert body["paused"] is None
    beta = live.get(f"/api/workbench/portals/{PORTAL}").json()
    assert [r[0]["id"] for r in beta["recent"]] == []


def test_the_first_live_message_starts_a_live_conversation(
    live: TestClient, chat: LiveChat
) -> None:
    def created(request: httpx2.Request) -> httpx2.Response:
        if request.url.path == "/workbench/conversations":
            chat.calls.append(("POST", request.url.path, json.loads(request.content)))
            return httpx2.Response(
                201, json={"conversation_id": "0199a000-0000-7000-8000-0000000000c9"}
            )
        return chat(request)

    live.app.state.web.chat_transport = httpx2.MockTransport(created)
    r = live.post(
        f"/api/workbench/portals/{PORTAL}/turns",
        json={"text": "Map it", "live": True},
        headers=ORIGIN,
    )
    assert (
        r.json()["href"]
        == f"/app/portals/{PORTAL}/workbench/live?c=0199a000-0000-7000-8000-0000000000c9"
    )
    assert ("POST", "/workbench/conversations", {"portal": PORTAL, "live": True}) in chat.calls
