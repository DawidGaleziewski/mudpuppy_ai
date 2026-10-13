"""Credential requests in the conversation (spec 022 FE-A05) and the assistant when the chat
service is down (FE-A06): the card is a vault field for one named reference that turns to
"Stored" once the vault has it, no value is ever on the page, and pages keep working without the
service."""

from __future__ import annotations

import json

import httpx2
from fastapi.testclient import TestClient

from pathfinder_dashboard.app import create_app
from pathfinder_dashboard.settings import Settings

from .conftest import Store, insert, ts
from .test_chat import CONV, ORIGIN, Service, seed_conversation, text

FAKE_SECRET = "fake-value-not-real"
NEEDED = "Credential needed: LIVEINSURER_PASSWORD · liveinsurer · sandbox · client. Login form reached."
STORED = "Stored in the vault: LIVEINSURER_PASSWORD (liveinsurer · sandbox). Values are never shown."


def client(store: Store, service: Service) -> TestClient:
    settings = Settings(data_dir=store.data_dir, default_env=store.env, ui_salvage="all")
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(service)))


def system_row(store: Store, seq: int, content: str, tool: str) -> None:
    conn = store.connect()
    insert(
        conn,
        "chat_messages",
        id=f"msg-{seq}",
        conversation_id=CONV,
        seq=seq,
        role="system",
        content=content,
        tool_name=tool,
        error_ref=None,
        created_at=ts(seq),
    )
    conn.commit()
    conn.close()


def test_request_card_is_one_vault_field_that_posts_to_the_vault(empty_store: Store) -> None:
    seed_conversation(empty_store)
    system_row(empty_store, 1, NEEDED, "request_credential")
    with client(empty_store, Service()) as c:
        body = c.get("/chat").text
    card = body[body.index('id="cred-msg-1"') - 400 : body.index("Skip logged-in pages")]
    assert 'name="ref:LIVEINSURER_PASSWORD"' in card and 'type="password"' in card
    assert f'action="/chat/conversations/{CONV}/credentials"' in card
    assert 'value="liveinsurer"' in card and 'value="sandbox"' in card
    assert "Needs you" in card and "Login form reached." in text(body)
    assert "Credential needed:" not in text(body)  # the line itself is not shown as a divider


def test_card_turns_stored_after_the_vault_notice(empty_store: Store) -> None:
    seed_conversation(empty_store)
    system_row(empty_store, 1, NEEDED, "request_credential")
    system_row(empty_store, 2, STORED, "credential_stored")
    with client(empty_store, Service()) as c:
        body = c.get("/chat").text
    assert 'name="ref:LIVEINSURER_PASSWORD"' not in body
    assert "is in the vault" in text(body) and "Stored" in body


def test_storing_from_the_card_never_echoes_the_value(empty_store: Store) -> None:
    seed_conversation(empty_store)
    service = Service()
    service.routes[("POST", f"/conversations/{CONV}/credentials")] = httpx2.Response(
        200, json={"stored": True, "refs": ["LIVEINSURER_PASSWORD"]}
    )
    with client(empty_store, service) as c:
        r = c.post(
            f"/chat/conversations/{CONV}/credentials",
            headers=ORIGIN,
            json={
                "portal": "liveinsurer",
                "environment": "sandbox",
                "values": {"LIVEINSURER_PASSWORD": FAKE_SECRET},
            },
        )
        page = c.get("/chat").text
    assert r.status_code == 200 and FAKE_SECRET not in r.text
    sent = next(q for q in service.requests if q.url.path.endswith("/credentials"))
    assert json.loads(sent.content)["values"] == {"LIVEINSURER_PASSWORD": FAKE_SECRET}
    assert FAKE_SECRET not in page


def test_service_down_drawer_shows_the_failure_and_pages_keep_working(empty_store: Store) -> None:
    seed_conversation(empty_store)
    with client(empty_store, Service(up=False)) as c:
        drawer = c.get("/fragments/assistant")
        home = c.get("/chat")
        screens = c.get("/screens")
        status = c.get("/fragments/assistant-status")
    assert drawer.status_code == 200 and "Assistant not running" in drawer.text
    assert "pnpm --dir apps/chat start" in drawer.text
    assert home.status_code == 200 and "Assistant not running" in home.text
    assert "disabled" in home.text  # composer and Send are off, history stays readable
    assert screens.status_code == 200
    assert "Assistant down" in status.text


# --- Home beside the assistant (screen 01, FE-A01, D-17) ---------------------------------------


def seed_home(store: Store) -> None:
    from .test_chat_forms import seed_run, seed_state, seed_superseded

    seed_conversation(store)
    seed_conversation(store, conv="conv-2", created=ts(30))
    seed_run(store)
    conn = store.connect()
    insert(conn, "runs", id="run-2", status="interrupted", started_at=ts(2), ended_at=ts(3))
    conn.commit()
    conn.close()
    seed_state(store, "st-1", "Start", "/")
    seed_state(store, "st-2", "FAQ", "/faq")
    seed_superseded(store, 1)
    conn = store.connect()
    insert(
        conn,
        "process_scopes",
        id="scope-1",
        conversation_id=CONV,
        portal_id="liveinsurer",
        process_name="Test process",
        persona="guest",
        start_state_id="st-1",
        end_state_id="st-2",
        selected_state_ids=json.dumps(["st-1", "st-2"]),
        comments="{}",
        source="ba_description",
        created_at=ts(5),
    )
    conn.commit()
    conn.close()


def test_home_shows_needs_you_processes_picker_and_suggestions(empty_store: Store) -> None:
    seed_home(empty_store)
    with client(empty_store, Service()) as c:
        body = c.get("/chat", params={"conversation": CONV}).text
    flat = text(body)
    needs = body[body.index('id="needs-h"') : body.index('id="proc-h"')]
    assert "Stopped scans to resume" in needs and "Amendments to re-anchor" in needs
    assert 'href="/activity' in needs and 'href="/amendments/superseded' in needs
    assert "Draft doc records" not in needs  # zero rows are left out
    assert body.count("sy-plate--intent") == 1
    assert "Test process" in flat and "2 screens" in flat and "/ → /faq" in flat
    assert 'name="conversation"' in body and f'value="{CONV}" selected' in body
    assert 'data-chat-say="Continue the stopped scan"' in body


def test_home_without_waiting_work_has_no_intent_plate(empty_store: Store) -> None:
    seed_conversation(empty_store)
    with client(empty_store, Service()) as c:
        body = c.get("/chat").text
    assert "sy-plate--intent" not in body and "No process scoped yet" in body
    assert 'name="conversation"' not in body  # one conversation: no picker
    assert 'data-chat-say="Continue the stopped scan"' not in body
