"""Review ▸ Differing states (spec 033 US4, screen 16): the BA's open proposal with its group
snapshot, one verdict select per outcome, and the confirmation through the chat service (mocked
here; the dashboard never writes)."""

from __future__ import annotations

import json

import httpx2
from fastapi.testclient import TestClient

from pathfinder_dashboard.app import create_app
from pathfinder_dashboard.settings import Settings

from .conftest import Store, ts
from .test_chat import ORIGIN, text

P = "liveinsurer"
SNAPSHOT = {
    "key": "action:home:button:Calculate",
    "kind": "action",
    "point": {"screen_id": "home", "route": "/", "title": "Home",
              "action": {"role": "button", "name": "Calculate"}},
    "outcomes": [
        {"screen_id": "quote", "state_id": "st-quote", "route": "/quote", "title": "Your quote",
         "state_kind": "main", "scans": [{"run_id": "run-aaaa1111", "persona": "guest"}],
         "first_seen": ts(1), "last_seen": ts(21), "http_status": None,
         "frequency": {"seen": 2, "of": 3}, "reproduced": True},
        {"screen_id": "down", "state_id": "st-503", "route": "/quote", "title": "Unavailable",
         "state_kind": "technical", "scans": [{"run_id": "run-bbbb2222", "persona": "guest"}],
         "first_seen": ts(11), "last_seen": ts(11), "http_status": 503,
         "frequency": {"seen": 1, "of": 3}, "reproduced": False},
    ],
}  # fmt: skip
PROPOSAL = [
    {"state_id": "st-quote", "verdict": "main", "hypothesis": "temporary", "reason": "2 of 3"},
    {"state_id": "st-503", "verdict": "temporary", "hypothesis": "temporary", "reason": "503 once"},
]


class Chat:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict]] = []

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.calls.append((request.method, request.url.path, json.loads(request.content or b"{}")))
        return httpx2.Response(200, json={"id": "rc-1", "status": "confirmed"})


def client(store: Store, chat: Chat, reviewer: str | None = "Owner") -> TestClient:
    settings = Settings(data_dir=store.data_dir, default_env=store.env, reviewer=reviewer)
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(chat)))


def seed(store: Store) -> None:
    conn = store.connect()
    conn.execute(
        "INSERT INTO reconciliations (id, portal_id, group_key, group_kind, snapshot_json,"
        " proposal_json, proposed_by, proposed_at, status)"
        " VALUES ('rc-1', ?, ?, 'action', ?, ?, 'session-1', ?, 'proposed')",
        (P, SNAPSHOT["key"], json.dumps(SNAPSHOT), json.dumps(PROPOSAL), ts(30)),
    )
    conn.commit()
    conn.close()


def test_review_lists_the_proposal_and_shows_its_outcomes_and_verdicts(empty_store: Store) -> None:
    seed(empty_store)
    with client(empty_store, Chat()) as c:
        page = c.get(f"/review?portal={P}&show=differing").text
    flat = text(page)
    assert "Differing states" in flat and "button · Calculate" in flat
    assert "Why does this differ?" in flat and "HTTP 503" in flat
    assert "2 of 3 scans · seen again" in flat and "1 of 3 scans · not seen again" in flat
    assert '<option value="temporary" selected>' in page
    assert 'name="verdict:st-quote"' in page and "Confirm verdicts" in page


def test_confirm_forwards_the_kept_and_changed_verdicts(empty_store: Store) -> None:
    seed(empty_store)
    chat = Chat()
    with client(empty_store, chat) as c:
        r = c.post(
            f"/review/differing/{P}/rc-1?portal={P}",
            data={"verdict:st-quote": "main", "verdict:st-503": "technical"},
            headers=ORIGIN,
            follow_redirects=False,
        )
    assert r.status_code == 303 and "Verdicts+confirmed" in r.headers["location"]
    assert chat.calls == [
        (
            "POST",
            f"/portals/{P}/reconciliations/rc-1/confirm",
            {
                "author": "Owner",
                "verdicts": [
                    {"state_id": "st-quote", "verdict": "main"},
                    {"state_id": "st-503", "verdict": "technical"},
                ],
            },
        )
    ]


def test_without_a_reviewer_nothing_is_sent_and_the_page_says_why(empty_store: Store) -> None:
    seed(empty_store)
    chat = Chat()
    with client(empty_store, chat, reviewer=None) as c:
        page = c.get(f"/review?portal={P}&show=differing").text
        r = c.post(f"/review/differing/{P}/rc-1?portal={P}", data={}, headers=ORIGIN,
                   follow_redirects=False)  # fmt: skip
    assert "Confirm verdicts" not in page and "PATHFINDER_REVIEWER" in page
    assert chat.calls == [] and "PATHFINDER_REVIEWER" in r.headers["location"]
