"""Probe suite fixtures (spec 032 US3, owner decision D-2): a suite the BA proposed, waiting with
its variants, and a mocked chat service that records the decision. The Review API tests use
them."""

from __future__ import annotations

import json

import httpx2
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store

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
