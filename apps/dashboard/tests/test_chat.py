"""The chat relay to the chat service (spec 010, R-30: US1, US2, FR-019; `web/chat_relay.py`) and
the chat read models, plus the scripted chat service and the seeds other tests share.

The chat service is mocked at the transport: no test touches the network."""

import json
import re
import sqlite3

import httpx2
from fastapi.testclient import TestClient

from mudpuppy_dashboard import db, queries_chat
from mudpuppy_dashboard.models import ChatConversation
from mudpuppy_dashboard.settings import Settings

from .conftest import T0, Store, insert, make_store, ts

CONV = "conv-1"
ORIGIN = {"Origin": "http://testserver"}


def text(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


def seed_conversation(
    store: Store, conv: str = CONV, portal: str | None = "liveinsurer", created: str = T0
) -> None:
    conn = store.connect()
    insert(
        conn,
        "chat_conversations",
        id=conv,
        portal_id=portal,
        goal="document the quote flow",
        acp_session_id=None,
        persona_draft="{}",
        status="active",
        created_at=created,
        updated_at=created,
    )
    conn.commit()
    conn.close()


def seed_message(
    store: Store, seq: int, role: str, content: str, error_ref: str | None = None, conv: str = CONV
) -> None:
    conn = store.connect()
    insert(
        conn,
        "chat_messages",
        id=f"msg-{conv}-{seq}",
        conversation_id=conv,
        seq=seq,
        role=role,
        content=content,
        tool_name=None,
        error_ref=error_ref,
        created_at=ts(seq),
    )
    conn.commit()
    conn.close()


def seed_step(
    store: Store,
    step: str,
    status: str,
    portal: str = "liveinsurer",
    error_ref: str | None = None,
    updated: int = 1,
    conv: str = CONV,
    run_id: str | None = None,
) -> None:
    conn = store.connect()
    insert(
        conn,
        "workflow_steps",
        id=f"step-{conv}-{step}-{portal}-{updated}",
        conversation_id=conv,
        portal_id=portal,
        step=step,
        status=status,
        run_id=run_id,
        session_id=None,
        error_ref=error_ref,
        started_at=None,
        finished_at=None,
        updated_at=ts(updated),
    )
    conn.commit()
    conn.close()


class Chunks(httpx2.AsyncByteStream):
    """A response body that is still unread when the proxy starts relaying it."""

    def __init__(self, *parts: bytes) -> None:
        self.parts = parts

    async def __aiter__(self):  # type: ignore[no-untyped-def]
        for part in self.parts:
            yield part


def sse(*parts: bytes) -> httpx2.Response:
    return httpx2.Response(
        200, stream=Chunks(*parts), headers={"content-type": "text/event-stream"}
    )


class Service:
    """A scripted chat service: records requests, answers from `routes` or is unreachable."""

    def __init__(self, up: bool = True) -> None:
        self.up = up
        self.requests: list[httpx2.Request] = []
        self.routes: dict[tuple[str, str], httpx2.Response] = {}

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        if not self.up:
            raise httpx2.ConnectError("connection refused", request=request)
        self.requests.append(request)
        found = self.routes.get((request.method, request.url.path))
        if found is not None:
            return found
        if request.url.path == "/healthz":
            return httpx2.Response(200, json={"ok": True})
        return httpx2.Response(404, json={"ref": "ERR-404", "message": "No such address."})


def make_chat_client(store: Store, service: Service) -> TestClient:
    from mudpuppy_dashboard.app import create_app

    settings = Settings(data_dir=store.data_dir, default_env=store.env)
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(service)))


# --- read models -------------------------------------------------------------------------------


def test_tracker_without_conversation_portal_follows_newest_row(empty_store: Store) -> None:
    seed_conversation(empty_store, portal=None)
    seed_step(empty_store, "scan", "done", portal="a", updated=1)
    seed_step(empty_store, "scan", "pending", portal="b", updated=5)
    ro = db.connect(empty_store.data_dir, empty_store.env)
    conv = queries_chat.get_conversation(ro, CONV)
    assert isinstance(conv, ChatConversation)
    tracker = queries_chat.tracker(ro, conv)
    ro.close()
    assert tracker.portal_id == "b" and tracker.rows[0].status == "pending" and tracker.active


def test_queries_on_a_store_without_chat_tables_say_nothing(tmp_path) -> None:  # type: ignore[no-untyped-def]
    store = make_store(tmp_path / "data")
    raw = sqlite3.connect(store)
    raw.execute("PRAGMA foreign_keys = OFF")
    for table in ("amendments", "process_scopes", "workflow_steps", "chat_messages"):
        raw.execute(f"DROP TABLE {table}")
    raw.execute("DROP TABLE chat_conversations")
    raw.commit()
    raw.close()
    ro = db.connect(tmp_path / "data", "test")
    assert queries_chat.newest_active_conversation(ro) is None
    assert queries_chat.list_messages(ro, "x") == []
    ro.close()


def seed_progress_run(store: Store, status: str = "running") -> None:
    """One run with a fact of every feed kind (T047): pages, steps, a form, problems, a skip, a
    question; two items still queued."""
    conn = store.connect()
    snapshot = json.dumps({"portal": {"id": "liveinsurer", "scope": {"max_steps": 400}}})
    insert(conn, "runs", id="run-p", status=status, steps_used=3, config_snapshot=snapshot)
    for sid, route, title in (("s-home", "/", "Home"), ("s-quote", "/quote", "Get a quote")):
        insert(
            conn, "states", id=sid, route_template=route, title=title, fingerprint=f"fp-{sid}",
            first_seen_run="run-p",
        )  # fmt: skip
    insert(conn, "state_observations", run_id="run-p", state_id="s-home", observed_at=ts(1))
    insert(conn, "state_observations", run_id="run-p", state_id="s-quote", observed_at=ts(2))
    link = json.dumps({"role": "link", "accessible_name": "Quote"})
    insert(
        conn, "transitions", id="e1", run_id="run-p", from_state="s-home", to_state="s-quote",
        action_json=link, created_at=ts(2),
    )  # fmt: skip
    insert(
        conn, "transitions", id="e2", run_id="run-p", from_state="s-quote", to_state=None,
        action_json=json.dumps({"role": "button", "accessible_name": "Next"}),
        error=json.dumps({"message": "timeout after 10s"}), created_at=ts(3),
    )  # fmt: skip
    insert(conn, "forms", id="f1", run_id="run-p", state_id="s-quote", created_at=ts(2, 30))
    insert(conn, "network_calls", id="n1", run_id="run-p", status=500, created_at=ts(4))
    for i, (st, reason) in enumerate(
        [("pending", None), ("pending", None), ("unreachable", "element gone")]
    ):
        insert(
            conn, "frontier", id=f"fr{i}", run_id="run-p", state_id="s-quote", status=st,
            reason=reason, action_json=link, updated_at=ts(5),
        )  # fmt: skip
    insert(conn, "open_questions", id="q1", run_id="run-p", text="Is PESEL required?",
           created_at=ts(6))  # fmt: skip
    conn.commit()
    conn.close()
    seed_step(store, "scan", "in_progress", run_id="run-p")


def test_progress_counts_and_feed_newest_first(empty_store: Store) -> None:
    """T047 (F-22 items 1, 2): what the run did, read from the store, so a reload shows it."""
    seed_conversation(empty_store)
    seed_progress_run(empty_store)
    conn = empty_store.connect()
    conn.row_factory = sqlite3.Row
    conversation = queries_chat.get_conversation(conn, CONV)
    assert conversation is not None
    p = queries_chat.progress(conn, queries_chat.tracker(conn, conversation))
    conn.close()
    assert p is not None
    assert (p.run_id, p.pages, p.queued, p.steps_used, p.max_steps) == ("run-p", 2, 2, 3, 400)
    assert p.last_activity == ts(6)
    assert [(i.kind, i.text) for i in p.items] == [
        ("question", "Question for you: Is PESEL required?"),
        ("skipped", 'Not done: link "Quote" (unreachable: element gone)'),
        ("problem", "HTTP 500 on GET /api/:param"),
        ("problem", 'Clicked button "Next" on /quote (no new page). Error: timeout after 10s'),
        ("form", "Form found on Get a quote"),
        ("page", "New page: Get a quote (/quote)"),
        ("step", 'Clicked link "Quote" on / → /quote'),
        ("page", "New page: Home (/)"),
    ]


# --- relay -------------------------------------------------------------------------------------


def test_create_conversation_is_forwarded(empty_store: Store) -> None:
    service = Service()
    service.routes[("POST", "/conversations")] = httpx2.Response(
        201, json={"id": "c9", "steps": []}
    )
    with make_chat_client(empty_store, service) as c:
        r = c.post(
            "/chat/conversations",
            json={"portal": "liveinsurer", "goal": "g", "evil": "dropped"},
            headers=ORIGIN,
        )
    assert r.status_code == 201 and r.json() == {"id": "c9", "steps": []}
    assert json.loads(service.requests[-1].content) == {"portal": "liveinsurer", "goal": "g"}


def test_send_message_is_forwarded_and_returns_202(empty_store: Store) -> None:
    service = Service()
    service.routes[("POST", "/conversations/c1/messages")] = httpx2.Response(
        202, json={"messageId": "m1"}
    )
    with make_chat_client(empty_store, service) as c:
        r = c.post("/chat/conversations/c1/messages", json={"text": "hi"}, headers=ORIGIN)
    assert r.status_code == 202 and r.json() == {"messageId": "m1"}
    assert json.loads(service.requests[-1].content) == {"text": "hi"}


def test_busy_409_passes_ref_and_message_through(empty_store: Store) -> None:
    service = Service()
    service.routes[("POST", "/conversations/c1/messages")] = httpx2.Response(
        409, json={"ref": "ERR-0007-q", "message": "A reply is still being written."}
    )
    with make_chat_client(empty_store, service) as c:
        r = c.post("/chat/conversations/c1/messages", json={"text": "hi"}, headers=ORIGIN)
    assert r.status_code == 409
    assert r.json() == {"ref": "ERR-0007-q", "message": "A reply is still being written."}


def test_empty_message_is_422_and_never_reaches_the_service(empty_store: Store) -> None:
    service = Service()
    with make_chat_client(empty_store, service) as c:
        r = c.post("/chat/conversations/c1/messages", json={"text": "   "}, headers=ORIGIN)
    assert r.status_code == 422 and not service.requests


def test_unreachable_service_answers_503_with_start_hint(empty_store: Store) -> None:
    with make_chat_client(empty_store, Service(up=False)) as c:
        sent = c.post("/chat/conversations/c1/messages", json={"text": "hi"}, headers=ORIGIN)
        created = c.post("/chat/conversations", json={}, headers=ORIGIN)
        events = c.get("/chat/conversations/c1/events")
    for r in (sent, created, events):
        assert r.status_code == 503
        assert "pnpm --dir apps/chat start" in r.json()["message"]


def test_relay_posts_from_a_foreign_origin_are_refused(empty_store: Store) -> None:
    service = Service()
    with make_chat_client(empty_store, service) as c:
        for url in (
            "/chat/conversations",
            "/chat/conversations/c1/messages",
            "/chat/conversations/c1/cancel",
            "/chat/conversations/c1/reset",
        ):
            r = c.post(url, json={"text": "hi"}, headers={"Origin": "http://evil.example"})
            assert r.status_code == 403, url
            r = c.post(url, json={"text": "hi"})
            assert r.status_code == 403, url
    assert not service.requests


def test_stop_and_reset_are_forwarded_with_the_services_answer(empty_store: Store) -> None:
    """T050, T051: Stop ends the turn and the conversation's runs; Reset passes a 409 on."""
    service = Service()
    service.routes[("POST", f"/conversations/{CONV}/cancel")] = httpx2.Response(
        200, json={"turn": True, "runs": []}
    )
    service.routes[("POST", f"/conversations/{CONV}/reset")] = httpx2.Response(
        409, json={"ref": None, "message": "Press [stop] first, then reset."}
    )
    with make_chat_client(empty_store, service) as c:
        stopped = c.post(f"/chat/conversations/{CONV}/cancel", headers=ORIGIN)
        busy = c.post(f"/chat/conversations/{CONV}/reset", headers=ORIGIN)
    assert stopped.status_code == 200 and stopped.json()["turn"] is True
    assert busy.status_code == 409 and "[stop]" in busy.json()["message"]


def test_sse_relay_streams_events_and_forwards_last_event_id(empty_store: Store) -> None:
    service = Service()
    first = b": connected\n\nid: 8\nevent: message_chunk\n"
    second = b'data: {"type":"message_chunk","text":"Hi"}\n\nid: 9\nevent: idle\ndata: {}\n\n'
    service.routes[("GET", "/conversations/c1/events")] = sse(first, second)
    with make_chat_client(empty_store, service) as c:
        r = c.get("/chat/conversations/c1/events", headers={"Last-Event-ID": "7"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.headers["cache-control"] == "no-store"
    assert r.content == first + second
    assert service.requests[-1].headers["last-event-id"] == "7"


def test_sse_relay_without_last_event_id_sends_none(empty_store: Store) -> None:
    service = Service()
    service.routes[("GET", "/conversations/c1/events")] = sse(b": connected\n\n")
    with make_chat_client(empty_store, service) as c:
        c.get("/chat/conversations/c1/events")
    assert "last-event-id" not in service.requests[-1].headers


def test_sse_relay_passes_a_404_from_the_service(empty_store: Store) -> None:
    service = Service()
    service.routes[("GET", "/conversations/c1/events")] = httpx2.Response(
        404, json={"ref": "ERR-1", "message": "This conversation does not exist."}
    )
    with make_chat_client(empty_store, service) as c:
        r = c.get("/chat/conversations/c1/events")
    assert r.status_code == 404 and r.json()["ref"] == "ERR-1"


def test_chat_url_comes_from_the_environment(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    assert Settings().chat_url == "http://127.0.0.1:4310"
    monkeypatch.setenv("MUDPUPPY_CHAT_URL", "http://127.0.0.1:9999")
    assert Settings().chat_url == "http://127.0.0.1:9999"


def test_reading_the_assistant_never_writes_the_store(empty_store: Store) -> None:
    seed_conversation(empty_store)
    before = empty_store.path.read_bytes()
    with make_chat_client(empty_store, Service()) as c:
        c.get("/api/portals/liveinsurer/assistant")
        c.get("/chat/conversations/conv-1/events")
    assert empty_store.path.read_bytes() == before
