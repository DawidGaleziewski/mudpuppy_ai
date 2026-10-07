"""Chat page, step tracker and the proxy to the chat service (spec 010, R-30: US1, US2, FR-019).

The chat service is mocked at the transport: no test touches the network."""

import json
import re
from datetime import datetime

import httpx2
from fastapi.testclient import TestClient

from pathfinder_dashboard import live_map, queries_chat
from pathfinder_dashboard.models import ChatConversation
from pathfinder_dashboard.settings import Settings

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
    from pathfinder_dashboard.app import create_app

    settings = Settings(data_dir=store.data_dir, default_env=store.env)
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(service)))


# --- page --------------------------------------------------------------------------------------


def test_page_with_no_conversation_shows_empty_state_and_nav(empty_store: Store) -> None:
    with make_chat_client(empty_store, Service()) as c:
        r = c.get("/chat")
    assert r.status_code == 200
    body = text(r.text)
    assert "No conversation yet" in body and "[new conversation]" in body
    assert 'href="/chat" aria-current="page"' in r.text
    assert "region-chat-tracker" not in r.text  # nothing to track yet


def test_unknown_conversation_is_a_404_not_found_state(empty_store: Store) -> None:
    with make_chat_client(empty_store, Service()) as c:
        r = c.get("/chat", params={"conversation": "nope"})
    assert r.status_code == 404 and "No conversation with id “nope”" in text(r.text)


def test_history_renders_in_seq_order_with_escaping_and_error_ref(empty_store: Store) -> None:
    seed_conversation(empty_store)
    seed_message(empty_store, 2, "assistant", "Which portal?")
    seed_message(empty_store, 1, "user", "hello <script>alert(1)</script>")
    seed_message(empty_store, 3, "system", "The scan failed.", error_ref="ERR-0001-ab")
    seed_message(empty_store, 4, "tool", "internal bookkeeping")
    with make_chat_client(empty_store, Service()) as c:
        r = c.get("/chat")
    html = r.text
    assert "<script>alert(1)</script>" not in html and "&lt;script&gt;" in html
    body = text(html)
    assert body.index("hello") < body.index("Which portal?") < body.index("The scan failed.")
    assert "internal bookkeeping" not in body
    assert "You" in body and "Assistant" in body and "System" in body
    assert "<code>ERR-0001-ab</code>" in html and 'data-copy="ERR-0001-ab"' in html
    assert "[FAIL]" in body
    assert 'id="region-chat-messages"' in html and "chat-settled from:body" in html


def test_conversation_param_picks_that_conversation(empty_store: Store) -> None:
    seed_conversation(empty_store, "conv-old")
    seed_message(empty_store, 1, "user", "from the old one", conv="conv-old")
    seed_conversation(empty_store, "conv-new", created=ts(5))
    seed_message(empty_store, 1, "user", "from the new one", conv="conv-new")
    with make_chat_client(empty_store, Service()) as c:
        newest = c.get("/chat").text
        picked = c.get("/chat", params={"conversation": "conv-old"}).text
    assert "from the new one" in newest and "from the old one" not in newest
    assert "from the old one" in picked and "from the new one" not in picked


def test_service_down_shows_how_to_start_it_not_a_traceback(empty_store: Store) -> None:
    seed_conversation(empty_store)
    seed_message(empty_store, 1, "user", "still readable")
    with make_chat_client(empty_store, Service(up=False)) as c:
        r = c.get("/chat")
    assert r.status_code == 200
    body = text(r.text)
    assert "The chat service is not running" in body
    assert "pnpm --dir apps/chat start" in body
    assert "still readable" in body  # history comes from the store
    assert re.search(r"<textarea[^>]*disabled", r.text)
    assert "Traceback" not in r.text


def test_fragment_for_missing_conversation_is_404(empty_store: Store) -> None:
    with make_chat_client(empty_store, Service()) as c:
        for url in ("/fragments/chat/messages", "/fragments/chat/tracker"):
            r = c.get(url, params={"conversation": "nope"})
            assert r.status_code == 404, url


# --- tracker -----------------------------------------------------------------------------------


def test_tracker_missing_rows_are_to_do(empty_store: Store) -> None:
    seed_conversation(empty_store)
    seed_step(empty_store, "scan", "done")
    with make_chat_client(empty_store, Service()) as c:
        r = c.get("/fragments/chat/tracker", params={"conversation": CONV})
    steps = re.findall(r'data-step="(\w+)" data-status="(\w+)"', r.text)
    assert steps == [
        ("scan", "done"),
        ("map", "todo"),
        ("narrow", "todo"),
        ("document", "todo"),
        ("amend", "todo"),
    ]
    body = text(r.text)
    assert "[DONE] done" in body and "[TODO] to do" in body
    assert 'data-active="0"' in r.text and "every 2s" not in r.text
    assert "store-changed from:body, step-changed from:body" in r.text


def test_tracker_statuses_error_ref_and_polling_while_active(empty_store: Store) -> None:
    seed_conversation(empty_store)
    seed_step(empty_store, "scan", "done")
    seed_step(empty_store, "map", "in_progress", updated=2)
    seed_step(empty_store, "narrow", "pending", updated=3)
    seed_step(empty_store, "document", "failed", error_ref="ERR-0042-zz", updated=4)
    with make_chat_client(empty_store, Service()) as c:
        r = c.get("/fragments/chat/tracker", params={"conversation": CONV})
    body = text(r.text)
    for label in ("[DONE] done", "[RUN.] in progress", "[PEND] pending", "[FAIL] failed"):
        assert label in body, label
    assert "[TODO] to do" in body  # amend has no row
    assert "<code>ERR-0042-zz</code>" in r.text
    assert 'data-active="1"' in r.text and "every 2s" in r.text


def test_tracker_stopped_scan_offers_resume_and_no_reference(empty_store: Store) -> None:
    """Spec 011 F-04: a scan the BA stopped is [STOP] with [resume scan], not a failure."""
    seed_conversation(empty_store)
    seed_step(empty_store, "scan", "stopped")
    with make_chat_client(empty_store, Service()) as c:
        r = c.get("/fragments/chat/tracker", params={"conversation": CONV})
    body = text(r.text)
    assert "[STOP] stopped" in body and "[FAIL]" not in body
    assert 'data-chat-say="Resume the scan."' in r.text and "[resume scan]" in body
    assert "reference" not in body
    assert 'data-active="0"' in r.text


def test_tracker_offers_stop_scan_only_while_the_linked_run_runs(empty_store: Store) -> None:
    """T041: in progress, or failed with the run left running (F-13), shows [stop scan]."""
    seed_conversation(empty_store)
    conn = empty_store.connect()
    insert(conn, "runs", id="run-live", portal_id="liveinsurer", status="running", started_at=ts(1))
    insert(conn, "runs", id="run-done", portal_id="liveinsurer", status="completed", started_at=ts(1))
    conn.commit()
    conn.close()
    seed_step(empty_store, "scan", "failed", run_id="run-live", error_ref="ERR-1-a")
    seed_step(empty_store, "map", "done", run_id="run-done")
    with make_chat_client(empty_store, Service()) as c:
        r = c.get("/fragments/chat/tracker", params={"conversation": CONV})
    assert r.text.count("[stop scan]") == 1
    assert 'data-stop-run="/chat/runs/run-live/stop"' in r.text


def test_stop_scan_forwards_to_the_service(empty_store: Store) -> None:
    service = Service()
    service.routes[("POST", "/runs/run-live/stop")] = httpx2.Response(
        200, json={"run_id": "run-live", "status": "interrupted"}
    )
    with make_chat_client(empty_store, service) as c:
        ok = c.post("/chat/runs/run-live/stop", headers=ORIGIN)
        cross = c.post("/chat/runs/run-live/stop")
    assert ok.status_code == 200 and ok.json()["status"] == "interrupted"
    assert cross.status_code == 403


def test_stop_button_forwards_to_the_service(empty_store: Store) -> None:
    """T050: the chat's [stop] ends the turn and the conversation's runs, same-origin only."""
    seed_conversation(empty_store)
    service = Service()
    service.routes[("POST", f"/conversations/{CONV}/cancel")] = httpx2.Response(
        200, json={"turn": True, "runs": []}
    )
    with make_chat_client(empty_store, service) as c:
        page = c.get("/chat", params={"conversation": CONV})
        ok = c.post(f"/chat/conversations/{CONV}/cancel", headers=ORIGIN)
        cross = c.post(f"/chat/conversations/{CONV}/cancel")
    assert f'data-cancel-url="/chat/conversations/{CONV}/cancel"' in page.text
    assert 'id="chat-stop"' in page.text
    assert ok.status_code == 200 and ok.json()["turn"] is True
    assert cross.status_code == 403


def test_reset_assistant_forwards_to_the_service(empty_store: Store) -> None:
    """T051: [reset assistant] in the page head, same-origin only, service errors passed on."""
    seed_conversation(empty_store)
    service = Service()
    service.routes[("POST", f"/conversations/{CONV}/reset")] = httpx2.Response(
        409, json={"ref": None, "message": "Press [stop] first, then reset."}
    )
    with make_chat_client(empty_store, service) as c:
        page = c.get("/chat", params={"conversation": CONV})
        busy = c.post(f"/chat/conversations/{CONV}/reset", headers=ORIGIN)
        cross = c.post(f"/chat/conversations/{CONV}/reset")
    assert f'data-reset-url="/chat/conversations/{CONV}/reset"' in page.text
    assert "[reset assistant]" in page.text
    assert busy.status_code == 409 and "[stop]" in busy.json()["message"]
    assert cross.status_code == 403


def test_tracker_uses_newest_row_per_step_and_the_conversations_portal(empty_store: Store) -> None:
    seed_conversation(empty_store, portal="liveinsurer")
    seed_step(empty_store, "scan", "in_progress", portal="liveinsurer", updated=1)
    seed_step(empty_store, "scan", "done", portal="liveinsurer", updated=2)
    seed_step(empty_store, "map", "done", portal="other", updated=9)  # another portal: ignored
    with make_chat_client(empty_store, Service()) as c:
        r = c.get("/fragments/chat/tracker", params={"conversation": CONV})
    assert re.findall(r'data-step="(\w+)" data-status="(\w+)"', r.text)[:2] == [
        ("scan", "done"),
        ("map", "todo"),
    ]
    assert "<code>liveinsurer</code>" in r.text


def test_tracker_without_conversation_portal_follows_newest_row(empty_store: Store) -> None:
    seed_conversation(empty_store, portal=None)
    seed_step(empty_store, "scan", "done", portal="a", updated=1)
    seed_step(empty_store, "scan", "pending", portal="b", updated=5)
    conn = empty_store.connect()
    conn.close()
    from pathfinder_dashboard import db

    ro = db.connect(empty_store.data_dir, empty_store.env)
    conv = queries_chat.get_conversation(ro, CONV)
    assert isinstance(conv, ChatConversation)
    tracker = queries_chat.tracker(ro, conv)
    ro.close()
    assert tracker.portal_id == "b" and tracker.rows[0].status == "pending" and tracker.active


def test_queries_on_a_store_without_chat_tables_say_nothing(tmp_path) -> None:  # type: ignore[no-untyped-def]
    import sqlite3

    from pathfinder_dashboard import db

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


# --- proxy -------------------------------------------------------------------------------------


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


def test_proxy_posts_from_a_foreign_origin_are_refused(empty_store: Store) -> None:
    service = Service()
    with make_chat_client(empty_store, service) as c:
        for url in ("/chat/conversations", "/chat/conversations/c1/messages", "/chat/new"):
            r = c.post(url, json={"text": "hi"}, headers={"Origin": "http://evil.example"})
            assert r.status_code == 403, url
            r = c.post(url, json={"text": "hi"})
            assert r.status_code == 403, url
    assert not service.requests


def test_new_conversation_form_redirects_to_the_new_one(empty_store: Store) -> None:
    service = Service()
    service.routes[("POST", "/conversations")] = httpx2.Response(
        201, json={"id": "c9", "steps": []}
    )
    with make_chat_client(empty_store, service) as c:
        r = c.post("/chat/new", headers=ORIGIN, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/chat?conversation=c9"


def test_new_conversation_with_service_down_goes_back_to_the_page(empty_store: Store) -> None:
    with make_chat_client(empty_store, Service(up=False)) as c:
        r = c.post("/chat/new", headers=ORIGIN, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/chat"


def test_sse_proxy_streams_events_and_forwards_last_event_id(empty_store: Store) -> None:
    service = Service()
    first = b": connected\n\nid: 8\nevent: message_chunk\n"
    second = b'data: {"type":"message_chunk","text":"Hi"}\n\nid: 9\nevent: idle\ndata: {}\n\n'
    stream = first + second
    service.routes[("GET", "/conversations/c1/events")] = sse(first, second)
    with make_chat_client(empty_store, service) as c:
        r = c.get("/chat/conversations/c1/events", headers={"Last-Event-ID": "7"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.headers["cache-control"] == "no-store"
    assert r.content == stream
    sent = service.requests[-1]
    assert sent.headers["last-event-id"] == "7"


def test_sse_proxy_without_last_event_id_sends_none(empty_store: Store) -> None:
    service = Service()
    service.routes[("GET", "/conversations/c1/events")] = sse(b": connected\n\n")
    with make_chat_client(empty_store, service) as c:
        c.get("/chat/conversations/c1/events")
    assert "last-event-id" not in service.requests[-1].headers


def test_sse_proxy_passes_a_404_from_the_service(empty_store: Store) -> None:
    service = Service()
    service.routes[("GET", "/conversations/c1/events")] = httpx2.Response(
        404, json={"ref": "ERR-1", "message": "This conversation does not exist."}
    )
    with make_chat_client(empty_store, service) as c:
        r = c.get("/chat/conversations/c1/events")
    assert r.status_code == 404 and r.json()["ref"] == "ERR-1"


def test_chat_url_comes_from_the_environment(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    assert Settings().chat_url == "http://127.0.0.1:4310"
    monkeypatch.setenv("PATHFINDER_CHAT_URL", "http://127.0.0.1:9999")
    assert Settings().chat_url == "http://127.0.0.1:9999"


def test_the_dashboard_never_writes_the_store(empty_store: Store) -> None:
    seed_conversation(empty_store)
    before = empty_store.path.read_bytes()
    with make_chat_client(empty_store, Service()) as c:
        c.get("/chat")
        c.get("/fragments/chat/tracker", params={"conversation": CONV})
        c.get("/fragments/chat/messages", params={"conversation": CONV})
    assert empty_store.path.read_bytes() == before


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
        conn, "edges", id="e1", run_id="run-p", from_state="s-home", to_state="s-quote",
        action_json=link, created_at=ts(2),
    )  # fmt: skip
    insert(
        conn, "edges", id="e2", run_id="run-p", from_state="s-quote", to_state=None,
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
    conn.row_factory = __import__("sqlite3").Row
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


def test_progress_fragment_polls_while_running_and_warns_when_quiet(empty_store: Store) -> None:
    """T047/T048: the fragment polls a running run; nothing recorded for 5 min is called out."""
    seed_conversation(empty_store)
    seed_progress_run(empty_store)
    with make_chat_client(empty_store, Service()) as c:
        r = c.get("/fragments/chat/progress", params={"conversation": CONV})
        page = c.get("/chat", params={"conversation": CONV})
    assert r.status_code == 200
    assert 'data-running="1"' in r.text and "every 3s" in r.text
    body = text(r.text)
    assert "2 pages found" in body and "2 still queued" in body and "3 / 400 steps" in body
    assert "Nothing recorded for" in body  # the seeded activity is long past
    assert '<a href="/states/s-quote' in r.text
    assert 'id="region-chat-progress"' in page.text


def test_progress_of_a_finished_run_does_not_poll(empty_store: Store) -> None:
    seed_conversation(empty_store)
    seed_progress_run(empty_store, status="completed")
    with make_chat_client(empty_store, Service()) as c:
        r = c.get("/fragments/chat/progress", params={"conversation": CONV})
    assert 'data-running="0"' in r.text and "every 3s" not in r.text
    assert "Nothing recorded for" not in text(r.text)
    assert '<details class="progress-feed">' in r.text  # closed when the run is over


def test_live_map_draws_the_discovery_tree_and_marks_the_current_page(empty_store: Store) -> None:
    """T049: pages of the run, the move that first reached each, the last page reached."""
    seed_conversation(empty_store)
    seed_progress_run(empty_store)
    conn = empty_store.connect()
    conn.row_factory = __import__("sqlite3").Row
    now = datetime.fromisoformat(ts(2, 30).replace("Z", "+00:00"))  # /quote seen 30 s before
    live = live_map.run_map(conn, "run-p", now)
    conn.close()
    assert live is not None and (live.pages, live.shown) == (2, 2)
    assert 's_s_home["/"]' in live.source and 's_s_quote["/quote"]' in live.source
    assert 's_s_home -->|"Quote"| s_s_quote' in live.source
    assert "class s_s_quote fresh" in live.source  # /home was seen 90 s before: not fresh
    assert "class s_s_quote current" in live.source


def test_live_map_fragment_answers_204_while_unchanged(empty_store: Store) -> None:
    """T049: the poll carries the drawn version; the server only redraws on a change."""
    seed_conversation(empty_store)
    seed_progress_run(empty_store)
    with make_chat_client(empty_store, Service()) as c:
        page = c.get("/chat", params={"conversation": CONV})
        first = c.get("/fragments/chat/map", params={"conversation": CONV})
        version = re.search(r"v=([a-z0-9-]+)", first.text)
        assert version is not None
        same = c.get("/fragments/chat/map", params={"conversation": CONV, "v": version[1]})
        other = c.get("/fragments/chat/map", params={"conversation": CONV, "v": "old"})
    assert 'id="region-chat-map"' in page.text and "every 3s" in first.text
    assert version[1].endswith("-running")
    assert same.status_code == 204
    assert other.status_code == 200 and "flowchart LR" in other.text
