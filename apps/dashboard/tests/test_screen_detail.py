"""The screen as observed revisions (spec 022 screen 08, T032): the seed and client the Screen
API tests share."""

from __future__ import annotations

import json

import httpx2
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store, insert
from .test_chat import Service
from .test_chat_forms import seed_amendment
from .test_revisions import T, seed


def client(store: Store, service: Service | None = None) -> TestClient:
    settings = Settings(
        data_dir=store.data_dir, default_env=store.env, ui_salvage="all", reviewer="Anna"
    )
    transport = httpx2.MockTransport(service or Service())
    return TestClient(create_app(settings, chat_transport=transport))


def seeded(store: Store) -> Store:
    """Screen scr-1 with r1 (st-r1) and r2 (st-r2); AMD-001 carried forward to r2 with two
    revisions; a process scope that starts on r2."""
    seed(store)
    seed_amendment(
        store,
        1,
        portal_id="liveinsurer",
        target_id="st-r2",
        text="Rename to Save",
        screen_id="scr-1",
        rev=2,
    )
    conn = store.connect()
    for rev, change, target, words in (
        (1, "create", "st-r1", "Rename"),
        (2, "carry_forward", "st-r2", "Rename to Save"),
    ):
        insert(
            conn,
            "amendment_revisions",
            amendment_id="amd-id-1",
            rev=rev,
            base_rev=None if rev == 1 else rev - 1,
            change=change,
            author="BA",
            status="active",
            target_kind="state",
            target_id=target,
            text=words,
            created_at=T.format(rev),
        )
    insert(
        conn,
        "chat_conversations",
        id="conv-1",
        portal_id="liveinsurer",
        goal="",
        created_at=T.format(1),
        updated_at=T.format(1),
    )
    insert(
        conn,
        "process_scopes",
        id="ps-1",
        conversation_id="conv-1",
        portal_id="liveinsurer",
        process_name="Buy a policy",
        persona="guest",
        start_state_id="st-r2",
        end_state_id="st-r2",
        selected_state_ids=json.dumps(["st-r2"]),
        source="ba_description",
        created_at=T.format(3),
    )
    conn.commit()
    conn.close()
    return store
