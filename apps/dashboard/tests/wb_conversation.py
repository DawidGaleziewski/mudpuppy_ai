"""The Workbench fixture conversation (spec 043): a turn with its view, narration and a proposed
command card, and the mocked chat service the Workbench API tests use."""

from __future__ import annotations

import json
from collections.abc import Iterator

import httpx2
import pytest
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store, insert
from .wb_fixture import PORTAL, RUN, seed_wb_scan

CONV = "0199a000-0000-7000-8000-0000000000c1"
CMD = "cmd-0001"
VIEW = "view-0001"
SPEC = {
    "version": "1",
    "path": "mapping",
    "why": "You asked to map the OC/AC calculator.",
    "components": [
        {"id": "map", "type": "LiveMap", "bind": {"scan": RUN}},
        {"id": "story", "type": "Narration", "bind": {"scan": RUN}},
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
        args_json=json.dumps({"scan": RUN}),
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
