"""Portal dropdown and "+ new portal" form (spec 011, R-31: FR-001 to FR-005).

The chat service is mocked at the transport, as in test_chat.py."""

import json
from pathlib import Path

import httpx2
from fastapi.testclient import TestClient

from pathfinder_dashboard.settings import Settings

from .conftest import Store, insert, ts
from .test_chat import CONV, ORIGIN, Service, seed_conversation, seed_step, text


def client(store: Store, service: Service, portals: Path) -> TestClient:
    from pathfinder_dashboard.app import create_app

    settings = Settings(data_dir=store.data_dir, default_env=store.env, portals_dir=portals)
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(service)))


def configured(tmp_path: Path, *ids: str) -> Path:
    for p in ids:
        (tmp_path / "portals" / p).mkdir(parents=True)
        (tmp_path / "portals" / p / "portal.yaml").write_text(f"id: {p}\n")
    return tmp_path / "portals"


def add_run(store: Store, run_id: str, portal: str) -> None:
    conn = store.connect()
    snapshot = json.dumps({"portal": {"id": portal}})
    insert(conn, "runs", id=run_id, portal_id=portal, config_snapshot=snapshot, started_at=ts(1))
    conn.commit()
    conn.close()


def test_dropdown_lists_configured_and_scanned_portals_and_new(
    empty_store: Store, tmp_path: Path
) -> None:
    """FR-001: configured and scanned portals, plus "all portals" and "+ new portal"."""
    add_run(empty_store, "run-u", "liveinsurer")
    with client(empty_store, Service(), configured(tmp_path, "wikipedia-org")) as c:
        r = c.get("/")
    assert r.status_code == 200
    options = text(r.text.split('name="portal"', 1)[1].split("</select>", 1)[0])
    assert "all portals" in options and "liveinsurer" in options and "wikipedia-org" in options
    assert "+ new portal" in options


def test_choice_is_kept_in_a_cookie_and_all_portals_clears_it(
    empty_store: Store, tmp_path: Path
) -> None:
    """FR-002, FR-003: Overview shows only the chosen portal's runs, on later pages too."""
    add_run(empty_store, "run-u", "liveinsurer")
    add_run(empty_store, "run-w", "wikipedia-org")
    with client(empty_store, Service(), configured(tmp_path)) as c:
        chosen = c.get("/", params={"portal": "wikipedia-org"})
        later = c.get("/")
        cleared = c.get("/", params={"portal": ""})
    assert "pf_portal=wikipedia-org" in chosen.headers["set-cookie"]
    assert 'value="wikipedia-org" selected' in later.text
    assert "run-w" in later.text and "run-u" not in later.text
    assert "run-u" in cleared.text and "run-w" in cleared.text


def test_new_portal_option_opens_the_form(empty_store: Store, tmp_path: Path) -> None:
    with client(empty_store, Service(), configured(tmp_path)) as c:
        r = c.get("/chat", params={"portal": "__new__"}, follow_redirects=False)
        form = c.get("/portals/new")
    assert r.status_code in (302, 307) and r.headers["location"].startswith("/portals/new")
    assert form.status_code == 200
    assert 'value="ignore" checked' in form.text
    for e in ("production", "staging", "sandbox"):  # FR-011: an address per environment
        assert f'name="url_{e}"' in form.text and f'name="limit_{e}"' in form.text


def test_docs_opens_the_chosen_portal(empty_store: Store, tmp_path: Path) -> None:
    with client(empty_store, Service(), configured(tmp_path, "liveinsurer")) as c:
        r = c.get("/docs", params={"portal": "liveinsurer"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/docs/liveinsurer"


def test_chat_opens_the_chosen_portals_conversation_and_new_is_for_it(
    empty_store: Store, tmp_path: Path
) -> None:
    """FR-003: newest conversation of the portal (also one whose steps are on it); [new
    conversation] asks the service for a fresh one for that portal."""
    seed_conversation(empty_store, conv=CONV, portal=None)
    seed_step(empty_store, "scan", "done", portal="liveinsurer")
    seed_conversation(empty_store, conv="conv-other", portal="wikipedia-org", created=ts(0))
    service = Service()
    service.routes[("POST", "/conversations")] = httpx2.Response(201, json={"id": "conv-new"})
    with client(empty_store, service, configured(tmp_path, "liveinsurer")) as c:
        page = c.get("/chat", params={"portal": "liveinsurer"})
        new = c.post("/chat/new", headers=ORIGIN, follow_redirects=False)
    assert f'data-conversation="{CONV}"' in page.text
    assert new.status_code == 303 and "conversation=conv-new" in new.headers["location"]
    sent = next(r for r in service.requests if r.url.path == "/conversations")
    assert json.loads(sent.content) == {"portal": "liveinsurer", "fresh": True}


def test_new_portal_form_saves_chooses_the_portal_and_opens_its_chat(
    empty_store: Store, tmp_path: Path
) -> None:
    """FR-004: the service writes the files; the dashboard selects it and opens a chat."""
    service = Service()
    service.routes[("POST", "/portals")] = httpx2.Response(
        201, json={"portal": "wikipedia-org", "persona": "guest"}
    )
    service.routes[("POST", "/conversations")] = httpx2.Response(201, json={"id": "conv-w"})
    with client(empty_store, service, configured(tmp_path)) as c:
        r = c.post(
            "/portals/new",
            data={
                "id": "",
                "robots": "ignore",
                "url_production": "https://www.wikipedia.org/",
                "limit_production": "read",
                "url_staging": "https://test.wikipedia.org/",
                "url_sandbox": "",
            },
            headers=ORIGIN,
            follow_redirects=False,
        )
    assert r.status_code == 303
    assert r.headers["location"] == "/chat?portal=wikipedia-org&conversation=conv-w"
    assert "pf_portal=wikipedia-org" in r.headers["set-cookie"]
    sent = next(q for q in service.requests if q.url.path == "/portals")
    # FR-011: only the environments with an address, each with its limit
    assert json.loads(sent.content) == {
        "robots": "ignore",
        "environments": {
            "production": {"base_url": "https://www.wikipedia.org/", "max_action_class": "read"},
            "staging": {
                "base_url": "https://test.wikipedia.org/",
                "max_action_class": "external-side-effect",
            },
        },
    }
    created = next(q for q in service.requests if q.url.path == "/conversations")
    assert json.loads(created.content) == {"portal": "wikipedia-org", "fresh": True}


def test_new_portal_form_shows_the_refusal_and_keeps_the_input(
    empty_store: Store, tmp_path: Path
) -> None:
    """FR-005: a name in use (or any refusal) is shown in place, the typed values kept."""
    service = Service()
    service.routes[("POST", "/portals")] = httpx2.Response(
        409, json={"ref": "ERR-1", "message": 'a portal called "liveinsurer" already exists'}
    )
    with client(empty_store, service, configured(tmp_path)) as c:
        r = c.post(
            "/portals/new",
            data={"url_production": "https://liveinsurer.example", "id": "liveinsurer"},
            headers=ORIGIN,
        )
        cross = c.post("/portals/new", data={"url_production": "https://x.test"})
    assert r.status_code == 400
    assert "already exists" in text(r.text)
    assert 'value="https://liveinsurer.example"' in r.text and 'value="liveinsurer"' in r.text
    assert cross.status_code == 403


def test_new_portal_form_says_when_the_chat_service_is_down(
    empty_store: Store, tmp_path: Path
) -> None:
    with client(empty_store, Service(up=False), configured(tmp_path)) as c:
        page = c.get("/portals/new")
        post = c.post("/portals/new", data={"url_sandbox": "https://x.test"}, headers=ORIGIN)
    assert "The chat service is not running" in text(page.text)
    assert post.status_code == 503 and 'value="https://x.test"' in post.text


# --- portal settings (FR-012) -------------------------------------------------------------------

TWO_ENVS = {
    "portal": "shop",
    "persona": "guest",
    "environments": [
        {
            "environment": "production",
            "base_url": "https://shop.example.pl/",
            "max_action_class": "read",
        },
        {
            "environment": "staging",
            "base_url": "https://staging.shop.example.pl/",
            "max_action_class": "external-side-effect",
        },
    ],
}


def test_settings_lists_environments_and_the_header_links_to_it(
    empty_store: Store, tmp_path: Path
) -> None:
    service = Service()
    service.routes[("GET", "/portals/shop")] = httpx2.Response(200, json=TWO_ENVS)
    with client(empty_store, service, configured(tmp_path, "shop")) as c:
        home = c.get("/", params={"portal": "shop"})
        page = c.get("/portals/shop/settings")
    assert 'href="/portals/shop/settings"' in home.text
    with client(empty_store, service, configured(tmp_path / "other")) as c:
        scanned_only = c.get("/", params={"portal": "shop"})  # no portal.yaml: no [settings]
    assert "/portals/shop/settings" not in scanned_only.text
    body = text(page.text)
    assert "https://shop.example.pl/" in body and "only look, never submit" in body
    assert "https://staging.shop.example.pl/" in body and "fill and submit forms" in body
    assert page.text.count("[revoke]") == 2
    assert 'value="sandbox" selected' in page.text  # the add form offers what is missing


def test_settings_adds_and_revokes_through_the_service(empty_store: Store, tmp_path: Path) -> None:
    service = Service()
    service.routes[("GET", "/portals/shop")] = httpx2.Response(200, json=TWO_ENVS)
    service.routes[("PUT", "/portals/shop/environments/sandbox")] = httpx2.Response(
        200, json=TWO_ENVS
    )
    service.routes[("DELETE", "/portals/shop/environments/staging")] = httpx2.Response(
        200, json=TWO_ENVS
    )
    with client(empty_store, service, configured(tmp_path, "shop")) as c:
        added = c.post(
            "/portals/shop/environments",
            data={"environment": "sandbox", "base_url": "http://127.0.0.1:4010/", "limit": "read"},
            headers=ORIGIN,
            follow_redirects=False,
        )
        revoked = c.post(
            "/portals/shop/environments/staging/revoke", headers=ORIGIN, follow_redirects=False
        )
        cross = c.post("/portals/shop/environments/staging/revoke")
    assert added.status_code == 303 and "saved=sandbox" in added.headers["location"]
    put = next(q for q in service.requests if q.method == "PUT")
    assert json.loads(put.content) == {
        "base_url": "http://127.0.0.1:4010/",
        "max_action_class": "read",
    }
    assert revoked.status_code == 303
    assert cross.status_code == 403


def test_settings_shows_the_services_refusal(empty_store: Store, tmp_path: Path) -> None:
    service = Service()
    one = {**TWO_ENVS, "environments": TWO_ENVS["environments"][:1]}
    service.routes[("GET", "/portals/shop")] = httpx2.Response(200, json=one)
    service.routes[("DELETE", "/portals/shop/environments/production")] = httpx2.Response(
        409, json={"ref": "ERR-2", "message": '"production" is the only environment of "shop"'}
    )
    with client(empty_store, service, configured(tmp_path, "shop")) as c:
        r = c.post("/portals/shop/environments/production/revoke", headers=ORIGIN)
        missing = c.get("/portals/nope/settings")
    assert r.status_code == 409 and "the only environment" in text(r.text)
    assert "[revoke]" not in r.text and "the only one" in text(r.text)
    assert missing.status_code == 404
