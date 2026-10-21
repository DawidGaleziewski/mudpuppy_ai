"""R-30 dashboard forms: credentials (T020), error lookup (T025), scope checklist (T027),
amendments on a state (T031), superseded review (T033). The chat service is mocked at the
transport; the store is a fixture built from the real migrations, opened read-only by the app."""

from __future__ import annotations

import html
import json
import re
from pathlib import Path

import httpx2
import pytest
from fastapi.testclient import TestClient

from pathfinder_dashboard import db, queries_chat
from pathfinder_dashboard.app import create_app
from pathfinder_dashboard.settings import Settings

from .conftest import T0, Store, insert, ts
from .test_chat import CONV, ORIGIN, Service, seed_conversation, seed_message, text
from .test_visuals import LAYOUT, SHOT, write_evidence

FAKE_SECRET = "fake-password-not-real"
RUN = "run-1"


def make_client(store: Store, service: Service, personas: Path | None = None) -> TestClient:
    extra = {"personas_dir": personas} if personas else {}
    settings = Settings(data_dir=store.data_dir, default_env=store.env, **extra)
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(service)))


@pytest.fixture
def personas(tmp_path: Path) -> Path:
    root = tmp_path / "personas"
    (root / "_mixins").mkdir(parents=True)
    (root / "_mixins" / "base.yaml").write_text("auth:\n  token: ref:SHARED_TOKEN\n")
    (root / "liveinsurer").mkdir()
    (root / "liveinsurer" / "client.yaml").write_text(
        "id: client\nextends: ['../_mixins/base.yaml', '../../outside.yaml']\n"
        "auth:\n  login: ref:LIVEINSURER_LOGIN\n  password: ref:LIVEINSURER_PASSWORD\n  other: ref:lower\n"
    )
    (root / "liveinsurer" / "guest.yaml").write_text("id: guest\nauth: none\n")
    return root


def seed_run(store: Store) -> None:
    conn = store.connect()
    insert(conn, "runs", id=RUN, status="completed", started_at=T0, ended_at=ts(1))
    conn.commit()
    conn.close()


def seed_state(store: Store, sid: str, title: str, route: str, **extra: object) -> None:
    conn = store.connect()
    insert(
        conn,
        "states",
        id=sid,
        fingerprint=f"fp-{sid}",
        title=title,
        route_template=route,
        first_seen_run=RUN,
        **extra,
    )
    conn.commit()
    conn.close()


def seed_amendment(store: Store, n: int, **over: object) -> None:
    row: dict[str, object] = {
        "id": f"amd-id-{n}",
        "key": f"AMD-{n:03d}",
        "portal_id": "liveinsurer",
        "scope_id": None,
        "target_kind": "state",
        "target_id": "st-1",
        "kind": "note",
        "text": f"note {n}",
        "attachment_sha256": None,
        "attachment_name": None,
        "author": "BA",
        "status": "active",
        "anchor_fingerprint": "fp",
        "anchor_route_template": "/",
        "anchor_element": None,
        "superseded_by_run": None,
        "superseded_reason": None,
        "superseded_detail": None,
        "superseded_at": None,
        "dismissed_at": None,
        "reapplied_as": None,
        "reapplies": None,
        "created_at": ts(n),
        "withdrawn_at": None,
        **over,
    }
    conn = store.connect()
    insert(conn, "amendments", **row)
    conn.commit()
    conn.close()


def seed_superseded(store: Store, n: int, **over: object) -> None:
    """An amendment a scan flagged for re-anchoring (`needs_reanchor` replaced `superseded`,
    spec 022); the superseded_* columns keep why."""
    row: dict[str, object] = {
        "status": "needs_reanchor",
        "superseded_by_run": RUN,
        "superseded_reason": "element_changed",
        "superseded_detail": "button renamed",
        "superseded_at": ts(10 + n),
        **over,
    }
    seed_amendment(store, n, **row)


@pytest.fixture
def mapped(empty_store: Store) -> Store:
    """A conversation about liveinsurer, one run, and two states (one with a screenshot and layout)."""
    write_evidence(empty_store.data_dir)
    seed_conversation(empty_store)
    seed_run(empty_store)
    seed_state(
        empty_store,
        "st-1",
        "Kalkulator <b>OC</b>",
        "/kalkulator",
        screenshot_ref=SHOT,
        layout_ref=LAYOUT,
    )
    seed_state(empty_store, "st-2", "Kontakt", "/kontakt")
    return empty_store


# --- queries ------------------------------------------------------------------------------------


def test_list_personas_reads_refs_from_file_and_mixins_only_inside_personas(personas: Path) -> None:
    found = {p.id: p.refs for p in queries_chat.list_personas(personas, "liveinsurer")}
    assert found == {"client": ["LIVEINSURER_LOGIN", "LIVEINSURER_PASSWORD", "SHARED_TOKEN"], "guest": []}
    assert queries_chat.list_personas(personas, "nope") == []
    assert queries_chat.list_personas(personas, "../liveinsurer") == []
    assert queries_chat.list_personas(personas, None) == []


def test_amendments_for_state_covers_state_and_its_elements_only(mapped: Store) -> None:
    seed_amendment(mapped, 1)
    seed_amendment(
        mapped,
        2,
        target_kind="wireframe_element",
        target_id='st-1#button "A#B"',
        kind="element_ref",
    )
    seed_state(mapped, "st-10", "Kontakt 10", "/kontakt-10")  # another state, same id prefix
    seed_amendment(mapped, 3, target_id="st-10")
    seed_amendment(
        mapped, 4, target_kind="wireframe_element", target_id="st-10#x", kind="element_ref"
    )
    conn = db.connect(mapped.data_dir, mapped.env)
    keys = [a.key for a in queries_chat.amendments_for_state(conn, "liveinsurer", "st-1")]
    assert keys == ["AMD-001", "AMD-002"]


def test_superseded_counts_skip_reapplied_dismissed_and_other_statuses(mapped: Store) -> None:
    seed_amendment(mapped, 9)
    seed_superseded(mapped, 1)
    seed_superseded(mapped, 2, reapplied_as="amd-id-9")
    seed_amendment(mapped, 3, status="dismissed", dismissed_at=ts(30))
    seed_amendment(mapped, 4)
    conn = db.connect(mapped.data_dir, mapped.env)
    assert queries_chat.superseded_counts(conn) == {"liveinsurer": 1}
    both = queries_chat.superseded_amendments(conn, None, "both")
    assert {a.key for a in both} == {"AMD-001", "AMD-002", "AMD-003"}  # not AMD-004, AMD-009
    assert [a.key for a in queries_chat.superseded_amendments(conn, "liveinsurer", "dismissed")] == [
        "AMD-003"
    ]
    assert queries_chat.superseded_amendments(conn, "other", "both") == []


def test_chat_tables_missing_in_an_old_store_give_nothing(tmp_path: Path) -> None:
    import sqlite3

    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    assert queries_chat.superseded_counts(conn) == {}
    assert queries_chat.amendments_for_state(conn, "p", "s") == []
    assert queries_chat.amendment_portals(conn) == []


# --- credentials form (T020) --------------------------------------------------------------------


def test_tools_region_has_password_fields_per_ref_and_never_a_value(
    mapped: Store, personas: Path
) -> None:
    with make_client(mapped, Service(), personas) as c:
        r = c.get("/chat")
    html = r.text
    for ref in ("LIVEINSURER_LOGIN", "LIVEINSURER_PASSWORD", "SHARED_TOKEN"):
        assert f'type="password" name="ref:{ref}"' in html
    assert 'name="extra_value"' in html and 'type="password" name="extra_value"' in html
    assert (
        html.count('value="sandbox"') == 1
        and 'value="staging"' in html
        and 'value="production"' in html
    )
    assert "used by client" in text(html)
    assert "never into the chat" in text(html)
    assert 'id="region-chat-tools"' in html and "formsDirty" in html
    assert 'action="/chat/conversations/conv-1/credentials"' in html
    assert re.search(r'type="password"[^>]*value=', html) is None


def test_tools_without_a_portal_ask_to_choose_one(empty_store: Store) -> None:
    seed_conversation(empty_store, portal=None)
    with make_client(empty_store, Service()) as c:
        body = text(c.get("/chat").text)
    assert body.count("Pick a portal first") == 2  # credentials and scope
    assert "Store in vault" not in body and "Save scope" not in body


def test_credentials_post_forwards_values_and_never_echoes_them(mapped: Store) -> None:
    service = Service()
    service.routes[("POST", f"/conversations/{CONV}/credentials")] = httpx2.Response(
        200, json={"stored": True, "refs": ["LIVEINSURER_LOGIN"], "echo": FAKE_SECRET}
    )
    body = {
        "portal": "liveinsurer",
        "environment": "staging",
        "values": {"LIVEINSURER_LOGIN": FAKE_SECRET, "EMPTY": ""},
    }
    with make_client(mapped, service) as c:
        r = c.post(f"/chat/conversations/{CONV}/credentials", json=body, headers=ORIGIN)
    assert r.status_code == 200 and r.json() == {"stored": True, "refs": ["LIVEINSURER_LOGIN"]}
    assert FAKE_SECRET not in r.text
    sent = json.loads(service.requests[-1].content)
    assert sent == {
        "portal": "liveinsurer",
        "environment": "staging",
        "values": {"LIVEINSURER_LOGIN": FAKE_SECRET},
    }


def test_credentials_vault_key_missing_409_is_passed_through(mapped: Store) -> None:
    service = Service()
    service.routes[("POST", f"/conversations/{CONV}/credentials")] = httpx2.Response(
        409, json={"ref": "ERR-1-a", "message": "No vault key is configured."}
    )
    with make_client(mapped, service) as c:
        r = c.post(
            f"/chat/conversations/{CONV}/credentials",
            json={"portal": "liveinsurer", "environment": "sandbox", "values": {"A_B": FAKE_SECRET}},
            headers=ORIGIN,
        )
    assert r.status_code == 409
    assert r.json() == {"ref": "ERR-1-a", "message": "No vault key is configured."}
    assert FAKE_SECRET not in r.text


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"environment": "sandbox", "values": {"A": "x"}}, "Choose a portal"),
        ({"portal": "liveinsurer", "environment": "prod", "values": {"A": "x"}}, "sandbox, staging"),
        ({"portal": "liveinsurer", "environment": "sandbox", "values": {"A": ""}}, "at least one value"),
        (
            {"portal": "liveinsurer", "environment": "sandbox", "values": {"bad name": "x"}},
            "capital letters",
        ),
    ],
)
def test_credentials_invalid_input_is_422_and_not_forwarded(
    mapped: Store, payload: dict[str, object], message: str
) -> None:
    service = Service()
    with make_client(mapped, service) as c:
        r = c.post(f"/chat/conversations/{CONV}/credentials", json=payload, headers=ORIGIN)
    assert r.status_code == 422 and message in r.json()["message"]
    assert not [q for q in service.requests if q.url.path.endswith("/credentials")]


def test_credentials_cross_origin_and_service_down(mapped: Store) -> None:
    ok = {"portal": "liveinsurer", "environment": "sandbox", "values": {"A": FAKE_SECRET}}
    with make_client(mapped, Service()) as c:
        assert c.post(f"/chat/conversations/{CONV}/credentials", json=ok).status_code == 403
        bad = {"Origin": "http://evil.example"}
        assert (
            c.post(f"/chat/conversations/{CONV}/credentials", json=ok, headers=bad).status_code
            == 403
        )
    with make_client(mapped, Service(up=False)) as c:
        r = c.post(f"/chat/conversations/{CONV}/credentials", json=ok, headers=ORIGIN)
    assert r.status_code == 503 and "not running" in r.json()["message"]
    assert "PATHFINDER_ENV=" in r.json()["message"]  # the start command names an environment
    assert FAKE_SECRET not in r.text


# --- error lookup (T025) ------------------------------------------------------------------------


def test_error_refs_in_chat_and_tracker_link_to_the_lookup(empty_store: Store) -> None:
    from .test_chat import seed_step

    seed_conversation(empty_store)
    seed_message(empty_store, 1, "system", "It failed.", error_ref="ERR-0001-ab")
    seed_step(empty_store, "scan", "failed", error_ref="ERR-0002-cd")
    with make_client(empty_store, Service()) as c:
        html = c.get("/chat").text
    assert re.search(r'<a [^>]*href="/chat/errors/ERR-0001-ab"', html)
    assert re.search(r'<a [^>]*href="/chat/errors/ERR-0002-cd"', html)


def test_error_lookup_shows_the_entry_with_pretty_detail_and_escaping(empty_store: Store) -> None:
    service = Service()
    service.routes[("GET", "/errors/ERR-0001-ab")] = httpx2.Response(
        200,
        json={
            "ref": "ERR-0001-ab",
            "time": "2026-10-05T10:00:00.000Z",
            "conversation_id": CONV,
            "step": "scan",
            "where": "POST /conversations",
            "message": "boom <script>x</script>",
            "detail": {"status": 500, "nested": {"a": 1}},
        },
    )
    with make_client(empty_store, service) as c:
        r = c.get("/chat/errors/ERR-0001-ab")
    assert r.status_code == 200
    body = text(r.text)
    for needle in ("2026-10-05 10:00:00Z", "scan", "POST /conversations", "boom"):
        assert needle in body
    assert "<script>x</script>" not in r.text and "&lt;script&gt;" in r.text
    shown = html.unescape(r.text)
    assert '"nested": {' in shown and '"status": 500' in shown  # pretty JSON in <pre>
    assert f'href="/chat?conversation={CONV}"' in r.text


def test_error_lookup_unknown_ref_says_no_log_entry(empty_store: Store) -> None:
    service = Service()
    service.routes[("GET", "/errors/ERR-9-zz")] = httpx2.Response(
        404, json={"ref": "ERR-2-x", "message": "No log entry has this reference."}
    )
    with make_client(empty_store, service) as c:
        r = c.get("/chat/errors/ERR-9-zz")
        malformed = c.get("/chat/errors/not-a-ref")
    assert r.status_code == 404 and "No log entry for “ERR-9-zz”" in text(r.text)
    assert malformed.status_code == 404 and "No log entry" in text(malformed.text)
    assert all(q.url.path != "/errors/not-a-ref" for q in service.requests)


def test_error_lookup_when_the_service_is_down(empty_store: Store) -> None:
    with make_client(empty_store, Service(up=False)) as c:
        r = c.get("/chat/errors/ERR-1-a")
    assert r.status_code == 503 and "pnpm --dir apps/chat start" in text(r.text)


# --- scope checklist (T027) ---------------------------------------------------------------------


def test_scope_checklist_lists_states_with_thumbnails_and_escaped_titles(
    mapped: Store, personas: Path
) -> None:
    with make_client(mapped, Service(), personas) as c:
        r = c.get("/chat")
    html = r.text
    assert "Kalkulator <b>OC</b>" not in html and "Kalkulator &lt;b&gt;OC&lt;/b&gt;" in html
    assert html.count('name="start_state_id"') == 2 and html.count('name="end_state_id"') == 2
    assert 'name="include" value="st-1"' in html and 'name="comment:st-2"' in html
    assert '<option value="client">client</option>' in html and '<option value="guest">' in html
    assert "2 screens" in text(html) and "Save scope" in text(html)
    assert 'name="process_name"' in html


def test_scope_checklist_shows_a_thumbnail_of_a_state_with_a_screenshot(
    mapped: Store, personas: Path
) -> None:
    with make_client(mapped, Service(), personas) as c:
        html = c.get("/chat").text
    assert f'src="/evidence/{SHOT}"' in html


def test_scope_checklist_empty_when_no_states_are_mapped(empty_store: Store) -> None:
    seed_conversation(empty_store)
    with make_client(empty_store, Service()) as c:
        body = text(c.get("/chat").text)
    assert "No screens mapped yet" in body and "Save scope" not in body


def test_tools_fragment_and_missing_conversation(mapped: Store, personas: Path) -> None:
    with make_client(mapped, Service(), personas) as c:
        ok = c.get("/fragments/chat/tools", params={"conversation": CONV})
        missing = c.get("/fragments/chat/tools", params={"conversation": "nope"})
    assert ok.status_code == 200 and "region-chat-tools" in ok.text
    assert missing.status_code == 404


SCOPE = {
    "portal": "liveinsurer",
    "process_name": "Quote",
    "persona": "client",
    "start_state_id": "st-1",
    "end_state_id": "st-2",
    "selected_state_ids": ["st-1", "st-2"],
    "comments": {"st-1": "check the VAT", "st-2": "  "},
    "source": "ba_description",
}


def test_scope_post_forwards_a_clean_body_and_returns_201(mapped: Store) -> None:
    service = Service()
    service.routes[("POST", f"/conversations/{CONV}/scope")] = httpx2.Response(
        201, json={"id": "scope-1", "process_name": "Quote"}
    )
    with make_client(mapped, service) as c:
        r = c.post(f"/chat/conversations/{CONV}/scope", json={**SCOPE, "x": 1}, headers=ORIGIN)
    assert r.status_code == 201 and r.json()["process_name"] == "Quote"
    sent = json.loads(service.requests[-1].content)
    assert sent == {**SCOPE, "comments": {"st-1": "check the VAT"}}


def test_scope_400_message_with_the_problems_reaches_the_browser(mapped: Store) -> None:
    service = Service()
    service.routes[("POST", f"/conversations/{CONV}/scope")] = httpx2.Response(
        400,
        json={
            "ref": "ERR-5-q",
            "message": "the scope refers to things that do not exist: state st-9 of liveinsurer",
        },
    )
    with make_client(mapped, service) as c:
        r = c.post(f"/chat/conversations/{CONV}/scope", json=SCOPE, headers=ORIGIN)
    assert r.status_code == 400 and "state st-9 of liveinsurer" in r.json()["message"]
    assert r.json()["ref"] == "ERR-5-q"


def test_scope_missing_fields_422_and_cross_origin_403_and_down_503(mapped: Store) -> None:
    service = Service()
    with make_client(mapped, service) as c:
        no_name = c.post(
            f"/chat/conversations/{CONV}/scope", json={**SCOPE, "process_name": " "}, headers=ORIGIN
        )
        no_end = c.post(
            f"/chat/conversations/{CONV}/scope", json={**SCOPE, "end_state_id": ""}, headers=ORIGIN
        )
        cross = c.post(f"/chat/conversations/{CONV}/scope", json=SCOPE)
    assert no_name.status_code == 422 and "Name the process" in no_name.json()["message"]
    assert no_end.status_code == 422 and "start state and an end state" in no_end.json()["message"]
    assert cross.status_code == 403
    assert not [q for q in service.requests if q.url.path.endswith("/scope")]
    with make_client(mapped, Service(up=False)) as c:
        assert (
            c.post(f"/chat/conversations/{CONV}/scope", json=SCOPE, headers=ORIGIN).status_code
            == 503
        )


# --- amendments on a state (T031) ---------------------------------------------------------------


def test_state_page_lists_to_be_amendments_apart_from_observed_facts(mapped: Store) -> None:
    seed_amendment(mapped, 1, text="make it <i>bigger</i>")
    seed_amendment(
        mapped,
        2,
        target_kind="wireframe_element",
        target_id='st-1#heading "Kalkulator OC/AC"',
        kind="element_ref",
        status="withdrawn",
        withdrawn_at=ts(20),
    )
    seed_amendment(
        mapped,
        3,
        kind="attachment",
        text=None,
        attachment_sha256="a" * 64,
        attachment_name="mock.png",
    )
    seed_amendment(mapped, 4, target_id="st-2")
    with make_client(mapped, Service()) as c:
        r = c.get("/states/st-1")
    html = r.text
    body = text(html)
    assert "To-be: what the business wants changed" in body and "Kept apart from how" in body
    assert "make it <i>bigger</i>" not in html and "make it &lt;i&gt;bigger&lt;/i&gt;" in html
    assert 'data-status="live">Active' in html and 'data-status="stopped">Withdrawn' in html
    assert "AMD-001" in body and "AMD-002" in body and "AMD-003" in body and "AMD-004" not in body
    assert "mock.png" in body and "Whole screen" in body
    assert html.count("data-withdraw=") == 2  # only active ones can be withdrawn
    assert '/chat/portals/liveinsurer/amendments/amd-id-1"' in html
    assert 'id="region-state-amendments"' in html and "/fragments/states/st-1/amendments" in html
    assert 'action="/chat/portals/liveinsurer/amendments"' in html and 'type="file"' in html
    # every element of the layout can be picked, with its key as the value
    assert (
        'value="heading &#34;Kalkulator OC/AC&#34;"' in html
        or 'value="heading "Kalkulator OC/AC""' in html
    )
    assert (
        "spinbutton &#34;Pojemność silnika&#34;" in html or 'spinbutton "Pojemność silnika"' in html
    )


def test_state_page_without_a_layout_offers_only_the_whole_screen(mapped: Store) -> None:
    with make_client(mapped, Service()) as c:
        body = text(c.get("/states/st-2").text)
    assert "No amendments on this screen" in body
    assert "only the whole screen can be amended" in body


def test_state_amendments_fragment_and_not_found(mapped: Store) -> None:
    seed_amendment(mapped, 1)
    with make_client(mapped, Service()) as c:
        ok = c.get("/fragments/states/st-1/amendments")
        missing = c.get("/fragments/states/nope/amendments")
    # the add form sits outside the live region, so typing in it is never swapped away
    assert ok.status_code == 200 and "AMD-001" in ok.text
    assert 'type="file"' not in ok.text and "Add an amendment" not in ok.text
    assert missing.status_code == 404 and "No screen with id “nope”" in text(missing.text)


def test_amendment_create_forwards_the_body_with_an_attachment(mapped: Store) -> None:
    service = Service()
    service.routes[("POST", "/portals/liveinsurer/amendments")] = httpx2.Response(
        201, json={"key": "AMD-001", "id": "x"}
    )
    body = {
        "kind": "element_ref",
        "target_kind": "wireframe_element",
        "target_id": 'st-1#button "Go"',
        "text": "rename",
        "attachment": {"name": "a.png", "content_base64": "aGk="},
        "junk": "dropped",
    }
    with make_client(mapped, service) as c:
        r = c.post("/chat/portals/liveinsurer/amendments", json=body, headers=ORIGIN)
    assert r.status_code == 201 and r.json()["key"] == "AMD-001"
    sent = json.loads(service.requests[-1].content)
    assert sent == {**{k: v for k, v in body.items() if k != "junk"}, "author": "unknown"}


def test_amendment_create_errors(mapped: Store) -> None:
    service = Service()
    service.routes[("POST", "/portals/liveinsurer/amendments")] = httpx2.Response(
        404, json={"ref": "ERR-3-a", "message": "This state has no element x."}
    )
    ok = {"kind": "note", "target_kind": "state", "target_id": "st-1", "text": "t"}
    with make_client(mapped, service) as c:
        upstream = c.post("/chat/portals/liveinsurer/amendments", json=ok, headers=ORIGIN)
        no_target = c.post("/chat/portals/liveinsurer/amendments", json={"kind": "note"}, headers=ORIGIN)
        huge = {"name": "big.bin", "content_base64": "A" * (queries_cap() + 1)}
        too_big = c.post(
            "/chat/portals/liveinsurer/amendments", json={**ok, "attachment": huge}, headers=ORIGIN
        )
        unreadable = c.post(
            "/chat/portals/liveinsurer/amendments",
            json={**ok, "attachment": {"name": "x"}},
            headers=ORIGIN,
        )
        cross = c.post("/chat/portals/liveinsurer/amendments", json=ok)
    assert upstream.status_code == 404 and "no element x" in upstream.json()["message"]
    assert no_target.status_code == 422
    assert too_big.status_code == 413 and "8 MB" in too_big.json()["message"]
    assert unreadable.status_code == 422
    assert cross.status_code == 403
    assert len(service.requests) == 1  # only the valid one went upstream; rejects never did
    with make_client(mapped, Service(up=False)) as c:
        assert c.post("/chat/portals/liveinsurer/amendments", json=ok, headers=ORIGIN).status_code == 503


def queries_cap() -> int:
    from pathfinder_dashboard.app import MAX_ATTACHMENT_B64

    return MAX_ATTACHMENT_B64


def test_amendment_withdraw_forwards_a_delete(mapped: Store) -> None:
    service = Service()
    service.routes[("DELETE", "/portals/liveinsurer/amendments/amd-id-1")] = httpx2.Response(
        200, json={"status": "withdrawn"}
    )
    with make_client(mapped, service) as c:
        r = c.delete("/chat/portals/liveinsurer/amendments/amd-id-1", headers=ORIGIN)
        refused = c.delete("/chat/portals/liveinsurer/amendments/amd-id-1")
    assert r.status_code == 200 and r.json() == {"status": "withdrawn"}
    assert service.requests[-1].method == "DELETE"
    assert refused.status_code == 403


# --- superseded review (T033) -------------------------------------------------------------------


def test_superseded_page_shows_reason_run_target_and_actions(mapped: Store) -> None:
    seed_amendment(mapped, 9, text="the re-applied copy")
    seed_superseded(
        mapped,
        1,
        text="rename <b>it</b>",
        target_kind="wireframe_element",
        target_id='st-1#button "Go"',
        kind="element_ref",
        anchor_element=json.dumps(
            {"key": 'button "Go"', "role": "button", "name": "Go", "roleIndex": 0}
        ),
    )
    seed_superseded(
        mapped,
        2,
        superseded_reason="state_replaced",
        superseded_detail="new layout",
        reapplied_as="amd-id-9",
    )
    seed_amendment(mapped, 3, status="dismissed", dismissed_at=ts(40))
    with make_client(mapped, Service()) as c:
        r = c.get(
            "/review", params={"portal": "liveinsurer", "show": "reanchor", "select": "reanchor:AMD-001"}
        )
        second = c.get("/review", params={"portal": "liveinsurer", "select": "reanchor:AMD-002"})
    html, body = r.text, text(r.text)
    assert r.status_code == 200 and "Amendments to re-anchor" in body
    # AMD-001 is selected: why it lost its place, the scan, the screen, the actions
    assert "rename &lt;b&gt;it&lt;/b&gt;" in html and "rename <b>it</b>" not in html
    assert "changed in the newer recording" in body and "button renamed" in body
    assert f'href="/runs/{RUN}"' in html and 'href="/states/st-1"' in html
    assert 'element <span class="sy-mono sy-mono--sm">button &#34;Go&#34;</span>' in html
    assert html.count("Re-anchor here") == 1 and html.count("data-dismiss=") == 1
    assert '/chat/portals/liveinsurer/amendments/amd-id-1/reapply"' in html
    assert 'list="dl-review-states"' in html and '<datalist id="dl-review-states">' in html
    assert 'name="state_id"' in html and 'value="st-1"' in html  # prefilled from the original
    assert 'value="button &#34;Go&#34;"' in html  # the element key too
    # a re-applied copy (AMD-002) and a dismissed one (AMD-003) wait for nobody
    assert "AMD-002" not in body and "AMD-003" not in body
    assert "AMD-002" not in text(second.text)


def test_superseded_url_redirects_to_the_review_reanchor_group(mapped: Store) -> None:
    """FR-009: the Console page and its filter fragment are gone; the URL leads to Review."""
    old = "/amendments/superseded"
    with make_client(mapped, Service()) as c:
        plain = c.get(old, follow_redirects=False)
        scoped = c.get(old, params={"portal": "liveinsurer"}, follow_redirects=False)
        fragment = c.get("/fragments/amendments/superseded")
    assert plain.status_code == 307 and plain.headers["location"] == "/review?show=reanchor"
    assert scoped.headers["location"] == "/review?portal=liveinsurer&show=reanchor"
    assert fragment.status_code == 404


def test_review_reanchor_group_empty_state_and_unknown_filter(mapped: Store) -> None:
    with make_client(mapped, Service()) as c:
        r = c.get("/review", params={"portal": "liveinsurer", "show": "bogus"})
    body = text(r.text)
    assert r.status_code == 200 and "Nothing to re-anchor" in body
    assert "a scan changes a screen" in body


def test_count_badge_on_chat_tracker_and_portal_card(mapped: Store) -> None:
    with make_client(mapped, Service()) as c:
        none = text(c.get("/chat").text)
        assert "to re-anchor" not in none
        seed_superseded(mapped, 1)
        seed_superseded(mapped, 2)
        seed_superseded(mapped, 3, reapplied_as="amd-id-1")  # decided: not counted
        chat = text(c.get("/chat").text)
        overview = text(c.get("/").text)
    assert "2 amendments to re-anchor" in chat
    assert "2 amendments to re-anchor" in overview


def test_reapply_and_dismiss_forward_to_the_service(mapped: Store) -> None:
    service = Service()
    service.routes[("POST", "/portals/liveinsurer/amendments/amd-id-1/reapply")] = httpx2.Response(
        201, json={"key": "AMD-004"}
    )
    service.routes[("POST", "/portals/liveinsurer/amendments/amd-id-1/dismiss")] = httpx2.Response(
        200, json={"status": "dismissed"}
    )
    body = {"target_kind": "state", "target_id": "st-2", "text": "", "junk": 1}
    with make_client(mapped, service) as c:
        r = c.post("/chat/portals/liveinsurer/amendments/amd-id-1/reapply", json=body, headers=ORIGIN)
        d = c.post("/chat/portals/liveinsurer/amendments/amd-id-1/dismiss", headers=ORIGIN)
        bad = c.post(
            "/chat/portals/liveinsurer/amendments/amd-id-1/reapply", json={"text": "x"}, headers=ORIGIN
        )
        cross = c.post("/chat/portals/liveinsurer/amendments/amd-id-1/dismiss")
    assert r.status_code == 201 and r.json()["key"] == "AMD-004"
    assert json.loads(service.requests[0].content) == {
        "target_kind": "state",
        "target_id": "st-2",
        "author": "unknown",
    }
    assert d.status_code == 200 and d.json() == {"status": "dismissed"}
    assert bad.status_code == 422 and cross.status_code == 403


def test_reapply_service_refusals_pass_through(mapped: Store) -> None:
    service = Service()
    service.routes[("POST", "/portals/liveinsurer/amendments/amd-id-1/reapply")] = httpx2.Response(
        404, json={"ref": "ERR-7-k", "message": "This state has no element nope."}
    )
    with make_client(mapped, service) as c:
        r = c.post(
            "/chat/portals/liveinsurer/amendments/amd-id-1/reapply",
            json={"target_kind": "wireframe_element", "target_id": "st-1#nope"},
            headers=ORIGIN,
        )
    assert r.status_code == 404 and r.json()["ref"] == "ERR-7-k"


# --- the pages are linked from where people are, and the dashboard stays read-only ---------------


def test_new_pages_are_in_the_smoke_start_set() -> None:
    from pathfinder_dashboard import smoke

    assert "/chat" in smoke.START_PAGES and "/amendments/superseded" in smoke.START_PAGES


def test_every_new_page_answers_200(mapped: Store, personas: Path) -> None:
    seed_superseded(mapped, 1)
    with make_client(mapped, Service(), personas) as c:
        for url in (
            "/chat",
            "/fragments/chat/tools?conversation=conv-1",
            "/amendments/superseded",
            "/review?portal=liveinsurer&show=reanchor",
            "/states/st-1",
            "/fragments/states/st-1/amendments",
        ):
            assert c.get(url).status_code == 200, url
