"""The React console's assistant drawer (R-96, spec 069): the portal's conversation as a timeline
(messages, failures with their reference, credential requests by name only, proposals), the
forwarders it calls, and the chat service stopped (mocked)."""

from __future__ import annotations

from .conftest import Store
from .test_assistant_cards import FAKE_SECRET, NEEDED, STORED, system_row
from .test_chat import CONV, Service, make_chat_client, seed_conversation, seed_message

API = "/api/portals/liveinsurer/assistant"


def test_the_timeline_has_messages_failures_and_credential_requests(empty_store: Store) -> None:
    seed_conversation(empty_store)
    seed_message(empty_store, 1, "user", "Map the quote flow")
    seed_message(empty_store, 2, "assistant", "Starting a scan.")
    seed_message(empty_store, 3, "system", "The scan stopped.", error_ref="ERR-abc")
    system_row(empty_store, 4, NEEDED, "request_credential")
    with make_chat_client(empty_store, Service()) as c:
        r = c.get(API)
    body = r.json()
    assert body["service_up"] and body["start_hint"] is None
    conv = body["conversation"]
    assert conv["id"] == CONV and conv["events"] == f"/chat/conversations/{CONV}/events"
    assert conv["send"].endswith("/messages") and conv["credentials"].endswith("/credentials")
    kinds = [(i["kind"], i["text"]) for i in body["items"][:3]]
    assert kinds == [
        ("user", "Map the quote flow"),
        ("assistant", "Starting a scan."),
        ("error", "The scan stopped."),
    ]
    assert body["items"][2]["ref"] == "ERR-abc"
    cred = body["items"][3]["credential"]
    assert (cred["ref"], cred["environment"], cred["persona"]) == (
        "LIVEINSURER_PASSWORD",
        "sandbox",
        "client",
    )
    assert not cred["stored"] and cred["status"]["word"] == "Needs you"
    assert body["items"][3]["text"] == "Login form reached."
    assert FAKE_SECRET not in r.text and body["full_page"] == f"/chat?conversation={CONV}"


def test_a_stored_credential_is_marked_stored(empty_store: Store) -> None:
    seed_conversation(empty_store)
    system_row(empty_store, 1, NEEDED, "request_credential")
    system_row(empty_store, 2, STORED, "credential_stored")
    with make_chat_client(empty_store, Service()) as c:
        items = c.get(API).json()["items"]
    cred = next(i for i in items if i["kind"] == "credential")["credential"]
    assert cred["stored"] and cred["status"]["word"] == "Stored"


def test_no_conversation_yet_and_the_chat_service_stopped(empty_store: Store) -> None:
    with make_chat_client(empty_store, Service(up=False)) as c:
        body = c.get(API).json()
        missing = c.get(f"{API}?conversation=nope")
    assert body["conversation"] is None and body["items"] == []
    assert not body["service_up"] and "pnpm --dir apps/chat start" in body["start_hint"]
    assert missing.status_code == 404


def test_another_portals_conversation_is_not_this_portals(empty_store: Store) -> None:
    seed_conversation(empty_store, portal="shop")
    with make_chat_client(empty_store, Service()) as c:
        assert c.get(API).json()["conversation"] is None
        assert c.get(f"{API}?conversation={CONV}").json()["conversation"]["portal"] == "shop"
