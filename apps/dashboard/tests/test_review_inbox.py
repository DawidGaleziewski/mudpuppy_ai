"""The Review inbox (spec 022 screen 09, T029): every kind of decision in one place with counts,
one intent plate, the selected item in the side pane, the decision forms, the nav marker and the
"Needs you" links that lead here. The chat service is mocked; records go through `docs:review`,
replaced here by a stub."""

from __future__ import annotations

import re

import httpx2
import pytest
from fastapi.testclient import TestClient

from pathfinder_dashboard import review
from pathfinder_dashboard.app import create_app
from pathfinder_dashboard.settings import Settings

from .conftest import PORTAL, Store
from .test_chat import ORIGIN, Service, text
from .test_chat_forms import seed_amendment
from .test_proposals import seeded


def client(store: Store, reviewer: str | None = "Anna") -> TestClient:
    settings = Settings(
        data_dir=store.data_dir, default_env=store.env, ui_salvage="all", reviewer=reviewer
    )
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(Service())))


def group(body: str, kind: str) -> str:
    start = body.index(f'id="group-{kind}"')
    end = body.find('id="group-', start + 1)
    return body[start : end if end > 0 else len(body)]


@pytest.fixture
def liveinsurer(empty_store: Store) -> Store:
    store = seeded(empty_store)
    seed_amendment(
        store,
        3,
        status="needs_reanchor",
        superseded_reason="element_removed",
        superseded_at="2026-10-14T08:00:00.000Z",
        anchor_route_template="/kalkulator",
    )
    return store


def test_inbox_groups_every_kind_with_counts_and_one_intent_plate(liveinsurer: Store) -> None:
    with client(liveinsurer) as c:
        body = c.get("/review?portal=liveinsurer").text
    flat = text(body)
    assert "3 decisions waiting for liveinsurer" in flat  # 1 to re-anchor + 2 undecided proposals
    assert body.count("sy-plate--intent") == 1
    assert "AMD-003" in group(body, "reanchor")
    proposals = group(body, "proposals")
    assert "Proposal p-open" in proposals and "Proposal p-moved" in proposals
    assert "Proposal p-new" not in proposals and "Proposal p-gone" not in proposals
    assert "No draft records wait" in group(body, "records")
    assert "No conflicts" in group(body, "conflicts")
    # The first non-empty group's first item is selected: the amendment to re-anchor.
    assert "Re-anchor AMD-003" in body and "The element it was anchored to is gone" in flat
    assert 'action="/chat/portals/liveinsurer/amendments/amd-id-3/reapply"' in body
    assert 'data-dismiss="/chat/portals/liveinsurer/amendments/amd-id-3/dismiss"' in body


def test_a_proposal_is_selected_by_link_and_the_filter_shows_one_kind(liveinsurer: Store) -> None:
    with client(liveinsurer) as c:
        body = c.get("/review?portal=liveinsurer&show=proposals&select=proposals:p-open").text
    assert 'id="group-reanchor"' not in body and 'id="group-proposals"' in body
    assert 'id="proposal-p-open"' in body
    assert 'data-proposal="/chat/portals/liveinsurer/proposals/p-open/apply"' in body
    assert re.search(r'href="[^"]*show=proposals[^"]*" aria-current="page"', body)


def test_records_to_confirm_show_their_screens_and_the_decision_form(ba_fixture: Store) -> None:
    with client(ba_fixture) as c:
        body = c.get(f"/review?portal={PORTAL}").text
        off = client(ba_fixture, reviewer=None).get(f"/review?portal={PORTAL}").text
    records = group(body, "records")
    assert 'sy-plate--intent" aria-labelledby="h-records"' in body
    keys = re.findall(r'class="sy-tag[^"]*"[^>]*>([A-Z]+-\d{3})<', records)
    assert keys, "draft records are listed"
    form = body[body.index('action="/review/records/') :]
    assert form.startswith(f'action="/review/records/{PORTAL}/{keys[0]}"')
    assert 'value="confirm"' in form and 'value="reject"' in form and 'value="comment"' in form
    assert "Review actions are off" in text(off)


def test_a_decision_runs_docs_review_and_comes_back_with_the_outcome(
    ba_fixture: Store, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[dict[str, object]] = []

    def fake(settings: Settings, env: str, **kw: object) -> review.ReviewOutcome:
        calls.append(kw)
        return review.ReviewOutcome(200, True, {"ok": True})

    monkeypatch.setattr(review, "submit_review", fake)
    with client(ba_fixture) as c:
        key = re.findall(
            r'action="/review/records/[^/]+/([A-Z]+-\d{3})"', c.get(f"/review?portal={PORTAL}").text
        )[0]
        url = f"/review/records/{PORTAL}/{key}"
        ok = c.post(
            url, data={"action": "confirm", "rev_no": "1"}, headers=ORIGIN, follow_redirects=False
        )
        no_reason = c.post(
            url,
            data={"action": "reject", "rev_no": "1", "reject": " "},
            headers=ORIGIN,
            follow_redirects=False,
        )
        foreign = c.post(url, data={"action": "confirm", "rev_no": "1"})
    assert ok.status_code == 303 and "Recorded+confirm" in ok.headers["location"]
    assert calls == [
        {"portal_id": PORTAL, "key": key, "rev_no": 1, "action": "confirm", "text": None}
    ]
    assert no_reason.status_code == 303 and "needs+a+text" in no_reason.headers["location"]
    assert foreign.status_code == 403


def test_nav_marker_counts_what_waits_and_needs_you_links_here(liveinsurer: Store) -> None:
    with client(liveinsurer) as c:
        page = c.get("/screens?portal=liveinsurer").text
    nav = page[page.index('class="sy-nav') : page.index("</nav>", page.index('class="sy-nav'))]
    assert re.search(r'href="/review[^"]*"[^>]*>Review <span class="sy-count">3</span>', nav)


def test_the_old_superseded_page_redirects_to_review_when_salvage_is_on(liveinsurer: Store) -> None:
    """FR-009: old URLs land in their new place."""
    with client(liveinsurer) as c:
        r = c.get("/amendments/superseded?portal=liveinsurer", follow_redirects=False)
    assert r.status_code == 307
    assert r.headers["location"] == "/review?portal=liveinsurer&show=reanchor"
