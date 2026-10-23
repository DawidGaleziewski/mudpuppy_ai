"""Processes fixtures (spec 022 M5): a liveinsurer process with its as-is, a to-be branch with a
reviewer's draft, a live mark and an open grouping suggestion, and a client with a reviewer. The
Processes API tests use them."""

from __future__ import annotations

import json

import httpx2
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store, insert, ts
from .test_chat import Service

P = "liveinsurer"


def step(sid: str, title: str, route: str, state: str | None, frm: list[str] | None = None) -> dict:
    return {
        "id": sid,
        "title": title,
        "route": route,
        "state_id": state,
        "screen_id": None,
        "observed": state is not None,
        "from": frm or [],
        "annotations": [],
    }


A1 = [
    step("s1", "Home", "/", "st-home"),
    step("s2", "Car", "/car", "st-car"),
    step("s3", "Driver", "/driver", "st-driver"),
]
B1 = [{**s, "from": [s["id"]]} for s in A1]
DRAFT = [
    B1[0],
    step("m1", "One form", "/quote", None, ["s2", "s3"]),
    step("n1", "Offer", "/offer", None),
]


def seed(store: Store, *, draft_base: int = 1, b_rev: int = 1) -> Store:
    conn = store.connect()
    insert(conn, "runs", id="run-p1", portal_id=P, started_at=ts(1))
    for sid, title, route in (
        ("st-home", "Home", "/"),
        ("st-car", "Car", "/car"),
        ("st-driver", "Driver", "/driver"),
        ("st-faq", "FAQ", "/faq"),
    ):
        insert(
            conn,
            "states",
            id=sid,
            portal_id=P,
            title=title,
            route_template=route,
            fingerprint=f"fp-{sid}",
            cluster_id=f"c-{sid}",
            first_seen_run="run-p1",
        )
    insert(
        conn,
        "ba_processes",
        id="pr-1",
        portal_id=P,
        key="PRC-001",
        name="Quote",
        persona="guest",
        stage="to_be_design",
        rev=1,
        source="new",
        scope_id=None,
        suggestion_id=None,
        created_at=ts(2),
        updated_at=ts(2),
    )
    insert(
        conn,
        "ba_process_revisions",
        process_id="pr-1",
        rev=1,
        base_rev=None,
        change="create",
        author="BA",
        name="Quote",
        stage="to_be_design",
        created_at=ts(2),
    )
    insert(
        conn,
        "process_models",
        id="v-a",
        process_id="pr-1",
        label="A",
        kind="as_is",
        rev=1,
        branched_from_model_id=None,
        branched_from_rev=None,
        created_at=ts(2),
    )
    insert(
        conn,
        "process_model_revisions",
        model_id="v-a",
        rev=1,
        base_rev=None,
        change="create",
        author="BA",
        steps=json.dumps(A1),
        note=None,
        run_id=None,
        restored_from=None,
        created_at=ts(2),
    )
    insert(
        conn,
        "process_models",
        id="v-b",
        process_id="pr-1",
        label="B",
        kind="to_be",
        rev=b_rev,
        branched_from_model_id="v-a",
        branched_from_rev=1,
        created_at=ts(3),
    )
    for rev in range(1, b_rev + 1):
        insert(
            conn,
            "process_model_revisions",
            model_id="v-b",
            rev=rev,
            base_rev=None if rev == 1 else rev - 1,
            change="branch" if rev == 1 else "save",
            author="Bob" if rev > 1 else "Anna",
            steps=json.dumps(B1),
            note=None,
            run_id=None,
            restored_from=None,
            created_at=ts(3 + rev),
        )
    insert(
        conn,
        "process_drafts",
        model_id="v-b",
        author="Anna",
        base_rev=draft_base,
        steps=json.dumps(DRAFT),
        updated_at=ts(9),
    )
    insert(
        conn,
        "process_live",
        id="lv-1",
        process_id="pr-1",
        environment="sandbox",
        model_id="v-a",
        model_rev=1,
        author="Anna",
        reason=None,
        created_at=ts(5),
    )
    insert(
        conn,
        "grouping_suggestions",
        id="sg-1",
        portal_id=P,
        name="Help pages",
        persona="guest",
        steps=json.dumps([step("s1", "FAQ", "/faq", "st-faq")]),
        why='menu link "FAQ"',
        screens_key="st-faq",
        status="open",
        conversation_id=None,
        process_id=None,
        decided_by=None,
        decided_at=None,
        created_at=ts(6),
    )
    conn.commit()
    conn.close()
    return store


def client(
    store: Store, service: Service | None = None, reviewer: str | None = "Anna"
) -> TestClient:
    settings = Settings(
        data_dir=store.data_dir, default_env=store.env, ui_salvage="all", reviewer=reviewer
    )
    return TestClient(
        create_app(settings, chat_transport=httpx2.MockTransport(service or Service()))
    )
