"""Workbench routes (spec 043 T030–T037): the page renders a conversation from the store (the
person's messages, the assistant's words, its view as cards, command cards with a fresh token,
narration); Send, Confirm and feedback go to the chat service. The chat service is mocked."""

from __future__ import annotations

import json
from collections.abc import Iterator

import httpx2
import pytest
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store, insert
from .wb_fixture import PORTAL, seed_wb_scan

CONV = "0199a000-0000-7000-8000-0000000000c1"
CMD = "cmd-0001"
VIEW = "view-0001"
SPEC = {
    "version": "1",
    "path": "mapping",
    "why": "You asked to map the OC/AC calculator.",
    "components": [
        {"id": "map", "type": "LiveMap", "bind": {"scan": "01a110d5"}},
        {"id": "story", "type": "Narration", "bind": {"scan": "01a110d5"}},
    ],
    "suggestions": ["Why did it stop here?"],
}
ORIGIN = {"origin": "http://testserver"}


def seed_conversation(store: Store) -> None:
    conn = store.connect()
    seed_wb_scan(conn)
    at = "2026-10-06T10:46:00.000Z"
    insert(
        conn,
        "chat_conversations",
        id=CONV,
        portal_id=PORTAL,
        goal="workbench",
        status="active",
        kind="workbench",
        created_at=at,
        updated_at=at,
    )
    insert(conn, "workbench_conversations", conversation_id=CONV, path="mapping", updated_at=at)
    for seq, role, content in (
        (0, "user", "Map the OC/AC calculator and what's around it."),
        (1, "assistant", "Starting a map scan. <b>I'll show</b> the route as it goes."),
    ):
        insert(
            conn,
            "chat_messages",
            id=f"m{seq}",
            conversation_id=CONV,
            seq=seq,
            role=role,
            content=content,
            created_at=at,
        )
    insert(
        conn,
        "workbench_views",
        id=VIEW,
        conversation_id=CONV,
        turn=1,
        path="mapping",
        why=SPEC["why"],
        spec_json=json.dumps(SPEC),
        received_json=json.dumps(SPEC),
        created_at=at,
    )
    insert(
        conn,
        "workbench_commands",
        id=CMD,
        conversation_id=CONV,
        turn=1,
        command="scan.resume",
        args_json=json.dumps({"scan": "01a110d5"}),
        reason="the form's button never appeared.",
        source="assistant",
        state="proposed",
        token_hash="0" * 64,
        precondition_hash="x",
        idempotency_key="k1",
        expires_at="2999-01-01T00:00:00Z",
        created_at=at,
        updated_at=at,
    )
    conn.commit()
    conn.close()


class Chat:
    """The mocked chat service: records each call, answers what the Workbench asks."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict]] = []

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        body = json.loads(request.content or b"{}")
        self.calls.append((request.method, request.url.path, body))
        path = request.url.path
        if path.endswith("/token"):
            return httpx2.Response(200, json={"token": "test-token-not-real"})
        if path == "/workbench/usage":
            return httpx2.Response(200, json={"turns_today": 3, "cap": 200})
        if path.endswith("/turns"):
            return httpx2.Response(202, json={"turn": 2})
        if path.endswith("/confirm") or path.endswith("/feedback"):
            return httpx2.Response(200, json={"state": "running", "value": "yes"})
        return httpx2.Response(404, json={"message": "not mocked"})


@pytest.fixture
def chat() -> Chat:
    return Chat()


@pytest.fixture
def client(empty_store: Store, chat: Chat) -> Iterator[TestClient]:
    seed_conversation(empty_store)
    settings = Settings(
        data_dir=empty_store.data_dir,
        default_env=empty_store.env,
        workbench=True,
        reviewer="dawid",
        workbench_command_envs=empty_store.env,  # D-6: the test store's environment is switched on
    )
    with TestClient(create_app(settings, chat_transport=httpx2.MockTransport(chat))) as c:
        yield c


def page(client: TestClient) -> str:
    r = client.get(f"/workbench?c={CONV}&portal={PORTAL}")
    assert r.status_code == 200, r.text
    return r.text


def test_the_page_renders_the_turn_with_its_view(client: TestClient) -> None:
    html = page(client)
    assert html.count("<h1") == 1
    assert "Map the OC/AC calculator and what&#39;s around it." in html
    assert "&lt;b&gt;I&#39;ll show&lt;/b&gt;" in html  # the assistant's words are text
    assert 'id="t1-map"' in html and 'Live map<span class="sy-sr-only">, generated' in html
    assert html.count('class="sy-film__item sy-askable"') == 6  # the six route pages
    assert "+2 side pages" in html
    assert 'data-state="failed"' in html and "Failed here" in html
    assert "171 steps · 17 pages · 113 queued" in html
    assert 'aria-pressed="true">Mapping' in html
    assert "Picked by the assistant: You asked to map the OC/AC calculator." in html


def test_the_lead_frame_alone_has_why_and_feedback(client: TestClient) -> None:
    html = page(client)
    assert html.count("Why this view?") == 1
    assert html.count('aria-label="Was this the right view?"') == 1
    assert f"/workbench/views/{VIEW}/feedback" in html


def test_a_stopped_scan_gets_its_error_card(client: TestClient) -> None:
    html = page(client)
    assert 'class="sy-genview sy-genview--card sy-genview--failure" id="t1-err"' in html
    assert "Next action failed at /kontakt" in html
    assert "element not found after 10 s" in html


def test_narration_cites_its_events(client: TestClient) -> None:
    html = page(client)
    assert 'class="sy-narration"' in html
    assert 'title="Event 01a110d5#12">step 12</a>' in html
    assert "The scan stopped at /kontakt." in html


def test_the_command_card_has_a_fresh_token_and_the_one_marker(
    client: TestClient, chat: Chat
) -> None:
    html = page(client)
    assert ("POST", f"/workbench/commands/{CMD}/token", {}) in chat.calls
    assert 'name="token" value="test-token-not-real"' in html
    assert html.count("sy-btn--primary") == 1
    assert "<dt>Starts</dt><dd>a new scan that continues 01a110d5</dd>" in html
    assert "<dt>From</dt><dd>/porownanie (last good checkpoint)</dd>" in html
    assert "<dt>Kept</dt><dd>17 pages, 113 queued links</dd>" in html


def test_send_forwards_the_text_and_the_chips(client: TestClient, chat: Chat) -> None:
    chips = json.dumps([{"kind": "page", "scan": "01a110d5", "route": "/kontakt"}])
    r = client.post(
        "/workbench/turn",
        data={"c": CONV, "text": "Why did it stop here?", "ctx": chips},
        headers=ORIGIN,
    )
    assert r.status_code == 200
    assert 'id="turn-t2-text"' in r.text and "Why did it stop here?" in r.text
    method, path, body = chat.calls[-1]
    assert (method, path) == ("POST", f"/workbench/conversations/{CONV}/turns")
    assert body["ctx"] == [{"kind": "page", "scan": "01a110d5", "route": "/kontakt"}]
    assert body["text"] == "Why did it stop here?"


def test_confirm_forwards_the_token_signed(client: TestClient, chat: Chat) -> None:
    r = client.post(
        f"/workbench/commands/{CMD}/confirm",
        data={"token": "test-token-not-real"},
        headers=ORIGIN,
    )
    assert r.status_code == 200
    assert (
        "POST",
        f"/workbench/commands/{CMD}/confirm",
        {"token": "test-token-not-real", "by": "dawid"},
    ) in chat.calls
    assert f'id="cmd-{CMD}"' in r.text


def test_confirm_is_refused_where_commands_are_off(empty_store: Store, chat: Chat) -> None:
    """D-6 (R-94 (8)): an environment not switched on says why and sends the person to Scans."""
    seed_conversation(empty_store)
    settings = Settings(
        data_dir=empty_store.data_dir,
        default_env=empty_store.env,
        workbench=True,
        reviewer="dawid",
        workbench_command_envs="local-dev,sandbox",
    )
    with TestClient(create_app(settings, chat_transport=httpx2.MockTransport(chat))) as c:
        r = c.post(
            f"/workbench/commands/{CMD}/confirm",
            data={"token": "test-token-not-real"},
            headers=ORIGIN,
        )
    assert f"Workbench commands are off on {empty_store.env}. Start scans in Scans." in r.text
    assert not any(call[1].endswith("/confirm") for call in chat.calls)


def test_confirm_forwards_the_persona_picked_on_a_start_card(
    client: TestClient, chat: Chat
) -> None:
    client.post(
        f"/workbench/commands/{CMD}/confirm",
        data={"token": "test-token-not-real", "persona": "guest"},
        headers=ORIGIN,
    )
    *_, body = next(c for c in chat.calls if c[1].endswith("/confirm"))
    assert body == {"token": "test-token-not-real", "by": "dawid", "persona": "guest"}


def test_a_start_card_lists_the_portals_personas(empty_store: Store, client: TestClient) -> None:
    conn = empty_store.connect()
    at = "2026-10-06T10:47:00.000Z"
    insert(
        conn,
        "workbench_commands",
        id="cmd-0002",
        conversation_id=CONV,
        turn=1,
        command="scan.start",
        args_json=json.dumps({"type": "full_map"}),
        reason="you asked for a map scan.",
        source="assistant",
        state="proposed",
        token_hash="0" * 64,
        precondition_hash="y",
        idempotency_key="k2",
        expires_at="2999-01-01T00:00:00Z",
        created_at=at,
        updated_at=at,
    )
    conn.commit()
    conn.close()
    html = page(client)
    assert 'name="persona" form="cmd-cmd-0002-confirm"' in html
    assert '<option value="guest" selected>guest</option>' in html  # reference-insurer's one
    assert 'name="persona" form="cmd-cmd-0001-confirm"' not in html  # a resume keeps its own


def test_cross_origin_posts_are_refused(client: TestClient, chat: Chat) -> None:
    r = client.post(f"/workbench/commands/{CMD}/confirm", data={"token": "x"})
    assert r.status_code == 403
    assert not any(path.endswith("/confirm") for _, path, _ in chat.calls)


def test_feedback_no_toggles_a_reason(client: TestClient, chat: Chat) -> None:
    client.post(
        f"/workbench/views/{VIEW}/feedback",
        data={"value": "no", "toggle": "too_much"},
        headers=ORIGIN,
    )
    _, path, body = chat.calls[-1]
    assert path == f"/workbench/views/{VIEW}/feedback"
    assert body == {"by": "dawid", "value": "no", "reasons": ["too_much"], "text": None}
