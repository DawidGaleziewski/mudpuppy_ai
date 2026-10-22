"""The screen page as one observed revision of its screen (spec 022 screen 08, T032): amendments
of the screen on every revision with their revision history, Edit as a new revision through the
chat service, the side tabs, the processes it is in, and the links into Review."""

from __future__ import annotations

import json

import httpx2
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store, insert
from .test_chat import ORIGIN, Service, text
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


def test_an_older_revision_still_lists_the_screens_amendments_with_history(
    empty_store: Store,
) -> None:
    store = seeded(empty_store)
    with client(store) as c:
        old = c.get("/states/st-r1").text
        new = c.get("/states/st-r2").text
    assert "AMD-001 r2" in old and "anchored to" in text(old)
    assert "AMD-001 r2" in new and "anchored to" not in text(new)
    assert "2 revisions" in new and "carry forward" in new and "AMD-001 r1" in new
    assert "In processes: Buy a policy · end" in text(new)
    assert "In processes" not in text(old)
    edit = new[new.index('data-json-form="edit"') :]
    assert 'action="/chat/portals/liveinsurer/amendments/amd-id-1"' in edit
    assert 'data-base-rev="2"' in edit and "Save as r3" in edit


def test_side_tabs_switch_by_link(empty_store: Store) -> None:
    store = seeded(empty_store)
    with client(store) as c:
        history = c.get("/states/st-r2", params={"side": "history"}).text
        cited = c.get("/states/st-r2", params={"side": "cited"}).text
        odd = c.get("/states/st-r2", params={"side": "nope"}).text
    assert "Observed revisions" in history and "First seen" in history
    assert 'data-json-form="amendment"' not in history
    assert "No record cites this screen" in cited
    assert 'data-json-form="amendment"' in odd  # unknown tab: amendments


def test_edit_forwards_a_signed_revision_with_its_base(empty_store: Store) -> None:
    store = seeded(empty_store)
    service = Service()
    service.routes[("PATCH", "/portals/liveinsurer/amendments/amd-id-1")] = httpx2.Response(
        200, json={"key": "AMD-001", "rev": 3}
    )
    with client(store, service) as c:
        ok = c.patch(
            "/chat/portals/liveinsurer/amendments/amd-id-1",
            json={"text": " Rename to Save now ", "base_rev": 2},
            headers=ORIGIN,
        )
        no_base = c.patch(
            "/chat/portals/liveinsurer/amendments/amd-id-1", json={"text": "x"}, headers=ORIGIN
        )
        foreign = c.patch(
            "/chat/portals/liveinsurer/amendments/amd-id-1", json={"text": "x", "base_rev": 2}
        )
    assert ok.status_code == 200 and ok.json()["rev"] == 3
    sent = [r for r in service.requests if r.method == "PATCH"]
    assert json.loads(sent[0].content) == {
        "author": "Anna",
        "text": "Rename to Save now",
        "base_rev": 2,
    }
    assert no_base.status_code == 422 and foreign.status_code == 403


def test_review_links_from_the_screen(empty_store: Store) -> None:
    store = seeded(empty_store)
    with client(store) as c:
        page = c.get("/states/st-r1").text
    assert "/review?portal=liveinsurer&amp;show=reanchor" in page
