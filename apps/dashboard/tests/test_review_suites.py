"""Probe suites in Review (spec 032 US3, owner decision D-2): a suite the BA proposed waits in the
inbox with its variants; the owner keeps or drops variants and changes expectations; the decision
goes to the chat service (mocked here), never into the store from the dashboard."""

from __future__ import annotations

import json

import httpx2
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store
from .test_chat import ORIGIN, text

P = "scar-maker"
T = "2026-10-17T01:00:00.000Z"
TRACE = {
    "id": "quote",
    "name": "Get a quote",
    "goal": "Reach the summary",
    "start_url": "/sc19/apply",
    "steps": [{"name": "Next", "kind": "click", "intent": "press Next"}],
    "variants": [
        {"id": "happy-path", "expect": "proceed", "probe": "happy-path"},
        {"id": "quote-500", "expect": "technical_error", "fault": "http_500", "probe": "http-500"},
    ],
}


def seed(store: Store) -> None:
    conn = store.connect()
    conn.execute(
        "INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date,"
        " viewport, locale, browser, config_snapshot, status, started_at) VALUES"
        " ('run-1', ?, 'quote-tester', 'map', 'test', '2026-10-17', '1366x768', 'en-GB',"
        " 'chromium', '{}', 'completed', ?)",
        (P, T),
    )
    conn.execute(
        "INSERT INTO form_steps (id, portal_id, route_template, step_index, form_name,"
        " controls_json, label, first_seen_run, created_at) VALUES"
        " ('fs-2', ?, '/sc19/apply', 2, 'Your contract', '[]', 'Your contract', 'run-1', ?)",
        (P, T),
    )
    notes = [{"variant": "quote-500", "probe_outcome_id": "o-1", "why": "the quote service fails"}]
    conn.execute(
        "INSERT INTO probe_suites (id, portal_id, run_id, form_step_id, trace_json, notes_json,"
        " status, created_at) VALUES ('suite-1', ?, 'run-1', 'fs-2', ?, ?, 'open', ?)",
        (P, json.dumps(TRACE), json.dumps(notes), T),
    )
    conn.commit()
    conn.close()


class Chat:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.calls.append((request.url.path, json.loads(request.content or b"{}")))
        return httpx2.Response(200, json={"id": "suite-1", "status": "approved"})


def client(store: Store, chat: Chat, reviewer: str | None = "Owner") -> TestClient:
    settings = Settings(
        data_dir=store.data_dir, default_env=store.env, ui_salvage="all", reviewer=reviewer
    )
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(chat)))


def test_an_open_suite_waits_in_review_with_its_variants(empty_store: Store) -> None:
    seed(empty_store)
    with client(empty_store, Chat()) as c:
        body = c.get(f"/review?portal={P}&select=suites:suite-1").text
    flat = text(body)
    assert "Probe suites to approve" in flat and "Get a quote" in flat
    assert "the quote service fails" in flat and "quote-500" in flat
    assert body.count("sy-plate--intent") <= 1 and body.count("sy-btn--primary") <= 1
    assert f'action="/review/suites/{P}/suite-1' in body


def test_approve_saves_the_edited_suite_then_approves_it_through_the_chat_service(
    empty_store: Store,
) -> None:
    seed(empty_store)
    chat = Chat()
    form = {
        "action": "approve",
        "variants": "2",
        "v0.id": "happy-path",
        "v0.keep": "1",
        "v0.expect": "branch",
        "v0.steps": "1",
        "v0.s0.kind": "click",
        "v0.s0.name": "Next",
        "v0.s1.kind": "fill",
        "v0.s1.name": "Promo code (optional)",
        "v0.s1.value": "WELCOME",
        "v1.id": "quote-500",
        "v1.steps": "1",
    }
    with client(empty_store, chat) as c:
        r = c.post(
            f"/review/suites/{P}/suite-1?portal={P}",
            data=form,
            headers=ORIGIN,
            follow_redirects=False,
        )
    assert r.status_code == 303 and "written" in r.headers["location"]
    assert [p for p, _ in chat.calls] == [
        f"/portals/{P}/probe-suites/suite-1/edit",
        f"/portals/{P}/probe-suites/suite-1/approve",
    ]
    edited = chat.calls[0][1]["trace"]
    assert [v["id"] for v in edited["variants"]] == ["happy-path"]  # quote-500 not kept
    assert edited["variants"][0]["expect"] == "branch"
    assert edited["variants"][0]["steps"] == [
        {"name": "Next", "kind": "click", "intent": "press Next"},
        {
            "name": "Promo code (optional)",
            "kind": "fill",
            "intent": "enter Promo code (optional)",
            "value": "WELCOME",
        },
    ]


def test_the_screen_page_lists_the_states_of_its_form_step_and_the_probe_outcomes(
    empty_store: Store,
) -> None:
    from .test_chat_forms import RUN, seed_run, seed_state

    seed_run(empty_store)
    conn = empty_store.connect()
    conn.execute(
        "INSERT INTO form_steps (id, portal_id, route_template, step_index, form_name,"
        " controls_json, label, first_seen_run, created_at) VALUES"
        " ('fs-1', 'liveinsurer', '/sc19/apply', 2, 'Your contract', '[]', 'Your contract', ?, ?)",
        (RUN, T),
    )
    conn.commit()
    conn.close()
    seed_state(empty_store, "st-1", "Get a quote", "/sc19/apply", form_step_id="fs-1")
    seed_state(
        empty_store,
        "st-2",
        "Get a quote",
        "/sc19/apply",
        form_step_id="fs-1",
        state_kind="validation",
    )
    conn = empty_store.connect()
    messages = [
        {"field": "Start date", "text": "Enter the start date as DD.MM.YYYY.", "source": "dom"}
    ]
    conn.execute(
        "INSERT INTO probe_outcomes (id, run_id, from_state_id, form_step_id, probe_id,"
        " probe_group, target, inputs_json, path_json, fault, outcome_kind, to_state_id, accepted,"
        " possible_new_process, messages_json, http_status, reason, evidence_ref, transition_id,"
        " created_at) VALUES ('o-1', ?, 'st-1', 'fs-1', 'wrong-format', 'validation',"
        " 'Start date', '[]', '{}', NULL, 'validation', 'st-2', 0, 0, ?, NULL,"
        " 'the form refused it', 'ev', NULL, ?)",
        (RUN, json.dumps(messages), T),
    )
    conn.commit()
    conn.close()
    with client(empty_store, Chat()) as c:
        body = c.get("/states/st-1?portal=liveinsurer").text
    flat = text(body)
    assert "States of this step" in flat and "Step 2 · Your contract" in flat
    assert 'data-status="todo">Validation' in body and "wrong-format" in flat
    assert "Enter the start date as DD.MM.YYYY." in flat
    assert body.count("sy-plate--intent") <= 1


def test_no_reviewer_or_a_foreign_origin_decides_nothing(empty_store: Store) -> None:
    seed(empty_store)
    chat = Chat()
    with client(empty_store, chat, reviewer=None) as c:
        r = c.post(
            f"/review/suites/{P}/suite-1",
            data={"action": "dismiss"},
            headers=ORIGIN,
            follow_redirects=False,
        )
        assert r.status_code == 303 and "MUDPUPPY_REVIEWER" in r.headers["location"]
        foreign = c.post(
            f"/review/suites/{P}/suite-1",
            data={"action": "dismiss"},
            headers={"Origin": "http://evil.test"},
        )
        assert foreign.status_code == 403
    assert chat.calls == []
