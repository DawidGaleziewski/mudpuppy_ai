"""The React console's Workbench (R-100, spec 071; spec 043): the page model as JSON (the turn
with its cards, narration and a command card with a fresh token), Send, Confirm and feedback to
the chat service. The chat service is mocked."""

from __future__ import annotations

import json

import httpx2
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store, insert
from .wb_conversation import (  # noqa: F401
    CMD,
    CONV,
    ORIGIN,
    VIEW,
    Chat,
    chat,
    client,
    seed_conversation,
)
from .wb_fixture import PORTAL, RUN

API = f"/api/workbench/portals/{PORTAL}"


def test_confirm_is_refused_where_commands_are_off(empty_store: Store, chat: Chat) -> None:  # noqa: F811
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
        r = c.post(f"/api/workbench/commands/{CMD}/confirm", json={"token": "t"}, headers=ORIGIN)
        page = c.get(API, params={"c": CONV}).json()
    assert r.status_code == 409
    assert (
        r.json()["message"]
        == f"Workbench commands are off on {empty_store.env}. Start scans in Scans."
    )
    assert page["paused"] == r.json()["message"]
    assert not any(call[1].endswith("/confirm") for call in chat.calls)


def test_a_start_card_asks_as_which_persona_and_sends_it(
    empty_store: Store,
    client: TestClient,  # noqa: F811
    chat: Chat,  # noqa: F811
) -> None:
    conn = empty_store.connect()
    at = "2026-10-06T10:47:00.000Z"
    insert(
        conn, "workbench_commands", id="cmd-0002", conversation_id=CONV, turn=1,
        command="scan.start", args_json=json.dumps({"type": "full_map"}),
        reason="you asked for a map scan.", source="assistant", state="proposed",
        token_hash="0" * 64, precondition_hash="y", idempotency_key="k2",
        expires_at="2999-01-01T00:00:00Z", created_at=at, updated_at=at,
    )  # fmt: skip
    conn.commit()
    conn.close()
    cards = {
        c["dom_id"]: c for c in client.get(API, params={"c": CONV}).json()["turns"][0]["commands"]
    }
    assert (
        cards["cmd-cmd-0002"]["ask_persona"] is True
        and "guest" in cards["cmd-cmd-0002"]["personas"]
    )
    assert cards["cmd-cmd-0001"]["ask_persona"] is False  # a resume keeps its own persona
    client.post(
        "/api/workbench/commands/cmd-0002/confirm",
        json={"token": "test-token-not-real", "persona": "guest"},
        headers=ORIGIN,
    )
    *_, body = next(c for c in chat.calls if c[1].endswith("/confirm"))
    assert body == {"token": "test-token-not-real", "by": "dawid", "persona": "guest"}


def test_the_page_gives_the_turn_with_its_cards_and_a_fresh_token(client: TestClient) -> None:  # noqa: F811
    p = client.get(API, params={"c": CONV}).json()
    assert p["conversation"]["id"] == CONV and p["portal"] == PORTAL
    (turn,) = p["turns"]
    assert turn["turn"]["asked"].startswith("Map the OC/AC calculator")
    assert [c["type"] for c in turn["cards"]][:1] == ["LiveMap"]
    assert turn["cards"][0]["scan"]["run_id"] == RUN
    assert turn["cards"][0]["frame"]["why"]["because"] == "You asked to map the OC/AC calculator."
    assert turn["narration"] and turn["narration"][0]["ref"].startswith(RUN)
    (cmd,) = turn["commands"]
    assert cmd["token"] == "test-token-not-real" and cmd["state"] == "proposed"
    assert p["statuses"]["wb_cmd"]["proposed"]["word"] == "Proposed"
    assert p["paused"] is None


def test_send_confirm_and_feedback_go_to_the_chat_service(client: TestClient, chat: Chat) -> None:  # noqa: F811
    sent = client.post(f"{API}/turns", json={"c": CONV, "text": "Why?", "ctx": []}, headers=ORIGIN)
    confirmed = client.post(
        f"/api/workbench/commands/{CMD}/confirm", json={"token": "t"}, headers=ORIGIN
    )
    liked = client.post(
        f"/api/workbench/views/{VIEW}/feedback", json={"value": "yes"}, headers=ORIGIN
    )
    foreign = client.post(f"{API}/turns", json={"c": CONV, "text": "x"})
    assert (
        sent.json()["ok"] is True and confirmed.json()["ok"] is True and liked.json()["ok"] is True
    )
    assert foreign.status_code == 403
    calls = {(m, p) for m, p, _ in chat.calls}
    assert ("POST", f"/workbench/conversations/{CONV}/turns") in calls
    assert ("POST", f"/workbench/commands/{CMD}/confirm") in calls
    body = next(b for m, p, b in chat.calls if p.endswith("/confirm"))
    assert body == {"token": "t", "by": "dawid"}


def _persona_command(store: Store, state: str, result: dict[str, object] | None = None) -> None:
    conn = store.connect()
    at = "2026-10-06T10:47:00.000Z"
    args = {"name": "client", "about": "A signed-in customer", "credential": "SHOP"}
    done = state != "proposed"
    insert(
        conn, "workbench_commands", id="cmd-0003", conversation_id=CONV, turn=1,
        command="persona.add", args_json=json.dumps(args),
        reason="Przedłuż polisę needs a signed-in customer.", source="assistant", state=state,
        token_hash="0" * 64, precondition_hash="p", idempotency_key="k3",
        expires_at="2999-01-01T00:00:00Z", created_at=at, updated_at=at,
        confirmed_by="dawid" if done else None, confirmed_at=at if done else None,
        result_json=json.dumps(result) if result else None,
    )  # fmt: skip
    conn.commit()
    conn.close()


def test_a_persona_card_is_editable_and_confirm_sends_the_edited_args(
    empty_store: Store,
    client: TestClient,  # noqa: F811
    chat: Chat,  # noqa: F811
) -> None:
    """Spec 072 (designer 19/04): persona.add's card carries its args and the sign-ins; Confirm
    sends what the person left in the fields."""
    _persona_command(empty_store, "proposed")
    cards = {
        c["dom_id"]: c for c in client.get(API, params={"c": CONV}).json()["turns"][0]["commands"]
    }
    card = cards["cmd-cmd-0003"]
    assert card["title"] == "Add a persona" and card["editable"]
    assert card["args"]["name"] == "client" and card["undo_url"] is None
    assert ("Undo", "Undo removes the persona until a scan uses it.") in map(tuple, card["facts"])
    edited = {"name": "klient", "credential": "SHOP"}
    client.post(
        "/api/workbench/commands/cmd-0003/confirm",
        json={"token": "test-token-not-real", "args": edited},
        headers=ORIGIN,
    )
    *_, body = next(c for c in chat.calls if c[1].endswith("/confirm"))
    assert body == {"token": "test-token-not-real", "by": "dawid", "args": edited}


def test_a_done_persona_card_says_so_and_can_be_undone(
    empty_store: Store,
    client: TestClient,  # noqa: F811
    chat: Chat,  # noqa: F811
) -> None:
    _persona_command(empty_store, "done", {"persona": "client", "credential_refs": []})
    page = client.get(API, params={"c": CONV}).json()
    card = next(c for c in page["turns"][0]["commands"] if c["dom_id"] == "cmd-cmd-0003")
    assert card["result"].startswith("Persona client added to ")
    assert card["undo_url"] == "/api/workbench/commands/cmd-0003/undo"
    r = client.post("/api/workbench/commands/cmd-0003/undo", json={}, headers=ORIGIN)
    assert r.json()["message"] == "Undone."
    assert ("POST", "/workbench/commands/cmd-0003/undo") in {(m, p) for m, p, _ in chat.calls}
