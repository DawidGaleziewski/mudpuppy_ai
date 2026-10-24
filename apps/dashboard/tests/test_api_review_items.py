"""The React console's Review, second part (R-96, spec 063): the detail of an unexplained
difference, an amendment to re-anchor, an assistant proposal and a probe suite, and their writes
to the chat service (mocked), signed with the reviewer."""

from __future__ import annotations

import json
from pathlib import Path

import httpx2
import pytest

from .conftest import Store
from .test_access import load_fixture
from .test_access_pages import client as access_client
from .test_chat import ORIGIN, Service
from .test_review_inbox import client as inbox_client
from .test_review_inbox import liveinsurer  # noqa: F401  (the fixture)
from .test_review_suites import Chat
from .test_review_suites import P as SUITE_PORTAL
from .test_review_suites import client as suite_client
from .test_review_suites import seed as seed_suite


@pytest.fixture
def personas_dir(tmp_path: Path) -> Path:
    d = tmp_path / "personas" / "access-shop"
    d.mkdir(parents=True)
    (d / "basic.yaml").write_text("attributes: { tariff: basic }\n")
    return tmp_path / "personas"


def test_a_difference_names_who_sees_it_and_links_side_by_side(
    empty_store: Store, personas_dir: Path
) -> None:
    load_fixture(empty_store)
    api = "/api/portals/access-shop/review"
    with access_client(empty_store, personas_dir) as c:
        body = c.get(f"{api}?show=differences&select=differences:sc-account|menu").json()
    d = body["selected"]
    assert d["has_detail"] is True and d["difference"]["element"] == "menu"
    sides = {s["label"]: s["personas"] for s in d["difference"]["sides"]}
    assert sides["Seen by"] == [{"value": "b2b", "label": "no attributes"}]
    assert {"value": "basic", "label": "tariff: basic"} in sides["Not seen by"]
    assert d["difference"]["compare"]["value"] == "/app/states/st-acc-2?left=b2b&right=basic"


def test_an_amendment_to_reanchor_and_its_writes(liveinsurer: Store) -> None:  # noqa: F811
    service = Service()
    base = "/portals/liveinsurer/amendments/amd-id-3"
    service.routes[("POST", f"{base}/reapply")] = httpx2.Response(
        200, json={"key": "AMD-003", "rev": 2}
    )
    service.routes[("POST", f"{base}/dismiss")] = httpx2.Response(200, json={})
    api = "/api/portals/liveinsurer/review"
    with inbox_client(liveinsurer) as c:
        c.app.state.web.chat_transport = httpx2.MockTransport(service)  # type: ignore[attr-defined]
        detail = c.get(f"{api}?show=reanchor").json()["selected"]
        moved = c.post(
            f"{api}/amendments/amd-id-3/reanchor",
            json={"state_id": "st-1", "element": "btn", "text": ""},
            headers=ORIGIN,
        )
        no_screen = c.post(f"{api}/amendments/amd-id-3/reanchor", json={}, headers=ORIGIN)
        gone = c.post(f"{api}/amendments/amd-id-3/dismiss", json={}, headers=ORIGIN)
    r = detail["reanchor"]
    assert r["key"] == "AMD-003" and r["why"].startswith("The element it was anchored to is gone")
    assert {"value": "st-1", "label": "Kalkulator · /kalkulator"} in r["states"]
    assert moved.json()["message"] == "AMD-003 re-anchored as r2."
    assert no_screen.status_code == 422
    assert gone.json()["message"] == "Dismissed: it left Review."
    sent = {q.url.path: json.loads(q.content) for q in service.requests}
    assert sent[f"{base}/reapply"] == {
        "target_kind": "wireframe_element",
        "target_id": "st-1#btn",
        "author": "Anna",
    }
    assert sent[f"{base}/dismiss"] == {"author": "Anna"}


def test_a_proposal_shows_its_change_and_is_applied(liveinsurer: Store) -> None:  # noqa: F811
    service = Service()
    service.routes[("POST", "/portals/liveinsurer/proposals/p-open/apply")] = httpx2.Response(
        200, json={"applied_rev": 2}
    )
    service.routes[("POST", "/portals/liveinsurer/proposals/p-open/undo")] = httpx2.Response(
        200, json={"rev": 3}
    )
    api = "/api/portals/liveinsurer/review"
    with inbox_client(liveinsurer) as c:
        c.app.state.web.chat_transport = httpx2.MockTransport(service)  # type: ignore[attr-defined]
        detail = c.get(f"{api}?show=proposals&select=proposals:p-open").json()["selected"]
        applied = c.post(f"{api}/proposals/p-open/apply", json={}, headers=ORIGIN)
        undone = c.post(f"{api}/proposals/p-open/undo", json={}, headers=ORIGIN)
        wrong = c.post(f"{api}/proposals/p-open/delete", json={}, headers=ORIGIN)
    p = detail["proposal"]
    assert p["key"] == "AMD-001" and p["next_rev"] == 2 and p["stale"] is False
    assert p["status"]["word"]
    # FE-A04: the applied state offers Undo, which restores the one before as a new revision
    assert applied.json()["message"] == "Applied as r2." and applied.json()["undo"] == "p-open"
    assert undone.status_code == 200 and "undo" not in undone.json()
    assert wrong.status_code == 422


def test_a_suite_is_edited_then_approved_through_the_chat_service(empty_store: Store) -> None:
    seed_suite(empty_store)
    chat = Chat()
    api = f"/api/portals/{SUITE_PORTAL}/review"
    edit = {
        "action": "approve",
        "variants": [
            {
                "id": "happy-path",
                "keep": True,
                "expect": "branch",
                "steps": [
                    {"kind": "click", "name": "Next", "value": ""},
                    {"kind": "fill", "name": "Promo code (optional)", "value": "WELCOME"},
                ],
            },
            {"id": "quote-500", "keep": False, "expect": "technical_error", "steps": []},
        ],
        "new": {"id": "", "from": "happy-path", "expect": "proceed"},
    }
    with suite_client(empty_store, chat) as c:
        detail = c.get(f"{api}?show=suites").json()["selected"]
        done = c.post(f"{api}/suites/suite-1", json=edit, headers=ORIGIN)
        missing = c.post(f"{api}/suites/nope", json=edit, headers=ORIGIN)
    s = detail["suite"]
    assert [v["id"] for v in s["variants"]] == ["happy-path", "quote-500"]
    assert s["variants"][0]["steps"] == [{"kind": "click", "name": "Next", "value": ""}]
    assert {"value": "branch", "label": "Leads elsewhere"} in s["expects"]
    assert done.json()["message"] == "Suite approved: written into traces.yaml."
    assert missing.status_code == 404
    assert [p for p, _ in chat.calls] == [
        f"/portals/{SUITE_PORTAL}/probe-suites/suite-1/edit",
        f"/portals/{SUITE_PORTAL}/probe-suites/suite-1/approve",
    ]
    edited = chat.calls[0][1]["trace"]
    assert [v["id"] for v in edited["variants"]] == ["happy-path"]
    assert edited["variants"][0]["steps"][1] == {
        "name": "Promo code (optional)",
        "kind": "fill",
        "intent": "enter Promo code (optional)",
        "value": "WELCOME",
    }
