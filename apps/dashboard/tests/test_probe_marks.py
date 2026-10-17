"""Probing only when asked (spec 032 US5, owner answer 3 of 2026-10-17): a form step is marked for
probing on its screen page, through the chat service (mocked here); the mark shows as the marker
tag of a person's mark; Screens lists every form step as marked, probed or not probed."""

from __future__ import annotations

import json

import httpx2
from fastapi.testclient import TestClient

from pathfinder_dashboard.app import create_app
from pathfinder_dashboard.settings import Settings

from .conftest import Store
from .test_chat import ORIGIN, text

T = "2026-10-17T01:00:00.000Z"
TAG = '<span class="sy-tag sy-tag--intent sy-tag--sm">Probe</span>'


class Chat:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict]] = []

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        body = json.loads(request.content or b"{}")
        self.calls.append((request.method, request.url.path, body))
        return httpx2.Response(201, json={"id": "m-1", "created": True})


def client(store: Store, chat: Chat, reviewer: str | None = "Owner") -> TestClient:
    settings = Settings(
        data_dir=store.data_dir, default_env=store.env, ui_salvage="all", reviewer=reviewer
    )
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(chat)))


def seed(store: Store) -> None:
    """Two form steps of one wizard: step 1 probed once, step 2 recorded, never probed."""
    from .test_chat_forms import RUN, seed_run, seed_state

    seed_run(store)
    conn = store.connect()
    for fs, n, label in (("fs-1", 1, "Your details"), ("fs-2", 2, "Your contract")):
        conn.execute(
            "INSERT INTO form_steps (id, portal_id, route_template, step_index, form_name,"
            " controls_json, label, first_seen_run, created_at) VALUES"
            " (?, 'liveinsurer', '/sc19/apply', ?, NULL, '[]', ?, ?, ?)",
            (fs, n, label, RUN, T),
        )
    conn.commit()
    conn.close()
    seed_state(store, "st-1", "Your details", "/sc19/apply", form_step_id="fs-1")
    seed_state(store, "st-2", "Your contract", "/sc19/apply", form_step_id="fs-2")
    seed_state(store, "st-3", "Home", "/")
    conn = store.connect()
    conn.execute(
        "INSERT INTO probe_outcomes (id, run_id, from_state_id, form_step_id, probe_id,"
        " probe_group, target, inputs_json, path_json, fault, outcome_kind, to_state_id, accepted,"
        " possible_new_process, messages_json, http_status, reason, evidence_ref, edge_id,"
        " created_at) VALUES ('o-1', ?, 'st-1', 'fs-1', 'required-empty-all', 'validation',"
        " NULL, '[]', '{}', NULL, 'validation', 'st-1', 0, 0, '[]', NULL, NULL, 'ev', NULL, ?)",
        (RUN, T),
    )
    conn.commit()
    conn.close()


def mark(store: Store, form_step_id: str) -> None:
    conn = store.connect()
    conn.execute(
        "INSERT INTO marks (id, portal_id, kind, target_kind, target_id, created_by, created_at)"
        " VALUES ('m-1', 'liveinsurer', 'probe', 'form_step', ?, 'Owner', ?)",
        (form_step_id, T),
    )
    conn.commit()
    conn.close()


def test_an_unmarked_step_is_marked_through_the_chat_service(empty_store: Store) -> None:
    seed(empty_store)
    chat = Chat()
    with client(empty_store, chat) as c:
        page = c.get("/states/st-2?portal=liveinsurer").text
        assert 'data-status="todo">Not probed' in page and "Mark for probing" in page
        assert TAG not in page
        r = c.post(
            "/states/st-2/probe-mark?portal=liveinsurer",
            data={"action": "mark"},
            headers=ORIGIN,
            follow_redirects=False,
        )
    assert r.status_code == 303 and "Marked+for+probing" in r.headers["location"]
    assert chat.calls == [
        (
            "POST",
            "/portals/liveinsurer/marks",
            {"author": "Owner", "kind": "probe", "target_kind": "form_step", "target_id": "fs-2"},
        )
    ]


def test_a_marked_step_shows_the_probe_tag_and_can_be_unmarked(empty_store: Store) -> None:
    seed(empty_store)
    mark(empty_store, "fs-2")
    chat = Chat()
    with client(empty_store, chat) as c:
        page = c.get("/states/st-2?portal=liveinsurer").text
        assert TAG in page and "Remove the mark" in page
        assert "Marked for probing by Owner" in text(page)
        c.post(
            "/states/st-2/probe-mark?portal=liveinsurer",
            data={"action": "remove"},
            headers=ORIGIN,
            follow_redirects=False,
        )
    assert [(m, p) for m, p, _ in chat.calls] == [("DELETE", "/portals/liveinsurer/marks")]


def test_screens_lists_each_form_step_as_marked_probed_or_not_probed(empty_store: Store) -> None:
    seed(empty_store)
    mark(empty_store, "fs-2")
    with client(empty_store, Chat()) as c:
        page = c.get("/screens?portal=liveinsurer").text
    assert TAG in page
    assert 'data-status="ok">Probed · 1' in page
    assert "2 form steps: 1 marked for probing, 0 not probed" in text(page)
    assert page.count("sy-btn--primary") <= 1


def test_the_coverage_chips_name_the_groups_not_probed(empty_store: Store) -> None:
    seed(empty_store)
    with client(empty_store, Chat()) as c:
        page = c.get("/states/st-1?portal=liveinsurer").text
    assert '<span class="sy-chip">1 validation</span>' in page
    assert '<span class="sy-chip sy-chip--dashed">technical not probed</span>' in page


def test_no_reviewer_or_a_foreign_origin_marks_nothing(empty_store: Store) -> None:
    seed(empty_store)
    chat = Chat()
    with client(empty_store, chat, reviewer=None) as c:
        assert "Mark for probing" not in c.get("/states/st-2?portal=liveinsurer").text
        r = c.post(
            "/states/st-2/probe-mark?portal=liveinsurer",
            data={"action": "mark"},
            headers=ORIGIN,
            follow_redirects=False,
        )
        assert "PATHFINDER_REVIEWER" in r.headers["location"]
        foreign = c.post(
            "/states/st-2/probe-mark",
            data={"action": "mark"},
            headers={"Origin": "http://evil.test"},
        )
        assert foreign.status_code == 403
    assert chat.calls == []
