"""Credential requests in the conversation (spec 022 FE-A05): the vault notices the assistant
cards are drawn from, and storing a value never echoes it. The cards themselves are React now
(R-100); the API tests use these rows."""

from __future__ import annotations

import json

import httpx2
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store, insert, ts
from .test_chat import CONV, ORIGIN, Service, seed_conversation

FAKE_SECRET = "fake-value-not-real"
NEEDED = (
    "Credential needed: LIVEINSURER_PASSWORD · liveinsurer · sandbox · client. Login form reached."
)
STORED = (
    "Stored in the vault: LIVEINSURER_PASSWORD (liveinsurer · sandbox). Values are never shown."
)


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
        conversation = c.get("/api/portals/liveinsurer/assistant", params={"conversation": CONV})
    assert r.status_code == 200 and FAKE_SECRET not in r.text
    sent = next(q for q in service.requests if q.url.path.endswith("/credentials"))
    assert json.loads(sent.content)["values"] == {"LIVEINSURER_PASSWORD": FAKE_SECRET}
    assert conversation.status_code == 200 and FAKE_SECRET not in conversation.text
