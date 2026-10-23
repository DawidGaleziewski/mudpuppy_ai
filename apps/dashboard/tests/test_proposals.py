"""The assistant's proposals in the conversation (spec 022 R6, FE-A04): the read model's stale and
undone logic, the cards in time order with Apply / Undo / Discard, and the decision route that
forwards to the chat service signed with the reviewer's name. The chat service is mocked."""

from __future__ import annotations

import json
import sqlite3

import httpx2
from fastapi.testclient import TestClient

from mudpuppy_dashboard import queries_proposals
from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store, insert, ts
from .test_chat import CONV, Service, seed_conversation, seed_message
from .test_chat_forms import seed_amendment, seed_run, seed_state


def client(store: Store, service: Service) -> TestClient:
    settings = Settings(
        data_dir=store.data_dir, default_env=store.env, ui_salvage="all", reviewer="Anna"
    )
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(service)))


def seed_revision(store: Store, amendment: str, rev: int, text_: str) -> None:
    conn = store.connect()
    insert(
        conn,
        "amendment_revisions",
        amendment_id=amendment,
        rev=rev,
        base_rev=None if rev == 1 else rev - 1,
        change="create" if rev == 1 else "edit",
        author="BA",
        status="active",
        target_kind="state",
        target_id="st-1",
        text=text_,
        created_at=ts(rev),
    )
    conn.commit()
    conn.close()


def seed_proposal(store: Store, pid: str, minute: int, **over: object) -> None:
    row: dict[str, object] = {
        "id": pid,
        "conversation_id": CONV,
        "portal_id": "liveinsurer",
        "target_kind": "amendment",
        "target_id": "amd-id-1",
        "base_rev": 1,
        "payload": json.dumps({"text": "clearer wording"}),
        "summary": f"Proposal {pid}",
        "status": "open",
        "created_at": ts(minute),
        **over,
    }
    conn = store.connect()
    insert(conn, "chat_proposals", **row)
    conn.commit()
    conn.close()


def seeded(store: Store) -> Store:
    """AMD-001 at r1 and AMD-002 moved on to r2; one proposal of each kind and state."""
    seed_conversation(store)
    seed_run(store)
    seed_state(store, "st-1", "Kalkulator", "/kalkulator")
    seed_amendment(store, 1, text="first wording")
    seed_revision(store, "amd-id-1", 1, "first wording")
    seed_amendment(store, 2, text="moved on", rev=2)
    seed_revision(store, "amd-id-2", 1, "old")
    seed_revision(store, "amd-id-2", 2, "moved on")
    seed_message(store, 1, "user", "Make AMD-001 clearer")
    seed_proposal(store, "p-open", 5)  # AMD-001 r1 → r2
    seed_proposal(store, "p-moved", 6, target_id="amd-id-2")  # made on r1, head is r2
    seed_proposal(
        store,
        "p-new",
        7,
        target_kind="new_amendment",
        target_id=None,
        base_rev=None,
        payload=json.dumps(
            {"kind": "note", "target_kind": "state", "target_id": "st-1", "text": "Add tax"}
        ),
        status="applied",
        applied_amendment_id="amd-id-1",
        applied_rev=1,
        decided_by="Anna",
        decided_at=ts(8),
    )
    seed_proposal(store, "p-gone", 9, status="discarded", decided_by="Anna", decided_at=ts(9))
    return store


def test_read_model_marks_a_moved_head_stale_and_keeps_the_base_text(empty_store: Store) -> None:
    store = seeded(empty_store)
    conn = store.connect()
    conn.row_factory = sqlite3.Row  # as the app's read-only connection
    views = {v.p.id: v for v in queries_proposals.for_conversation(conn, CONV)}
    conn.close()
    assert [v.p.id for v in views.values()] == ["p-open", "p-moved", "p-new", "p-gone"]
    assert views["p-open"].stale is False and views["p-open"].next_rev == 2
    assert views["p-open"].before_text == "first wording" and views["p-open"].key == "AMD-001"
    assert views["p-moved"].stale is True and views["p-moved"].head_rev == 2
    assert views["p-new"].is_new and views["p-new"].key == "AMD-001"
    assert views["p-gone"].undone is False
