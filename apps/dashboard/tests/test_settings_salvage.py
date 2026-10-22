"""Settings in Salvage Yard (spec 022 T031, screen 11; FE-T01, FE-T02): section links, the
environments table and form, the Revoke dialog, collapsed credentials (names only), personas, crawl
rules, the data store, and no page context for the drawer. The chat service is mocked."""

from __future__ import annotations

import json
from pathlib import Path

import httpx2
import pytest
from fastapi.testclient import TestClient

from pathfinder_dashboard.app import create_app
from pathfinder_dashboard.settings import Settings

from .conftest import Store, insert, ts
from .test_chat import ORIGIN, Service, text
from .test_portals import TWO_ENVS

SECRET = "ciphertext-not-a-real-value"


@pytest.fixture
def world(empty_store: Store, tmp_path: Path) -> tuple[Store, Path, Path]:
    portals, personas = tmp_path / "portals", tmp_path / "personas"
    (portals / "shop").mkdir(parents=True)
    (portals / "shop" / "portal.yaml").write_text(
        "id: shop\nrobots: respect\nscope:\n  allowed_domains: [shop.example.pl]\n"
        "urls:\n  disallowed: ['/<b>admin/*']\ndenylist:\n  - logout\n"
    )
    (personas / "shop").mkdir(parents=True)
    (personas / "shop" / "guest.yaml").write_text("auth: none\n")
    (personas / "shop" / "client.yaml").write_text(
        "auth:\n  login: ref:SHOP_LOGIN\n"
        "attributes: { tariff: premium, features: [export, share] }\n"
    )
    conn = empty_store.connect()
    insert(
        conn,
        "credentials",
        id="c1",
        portal_id="shop",
        environment="staging",
        ref_name="SHOP_LOGIN",
        ciphertext=SECRET.encode(),
        nonce=b"0" * 12,
        key_id="abcdef01",
        created_at=ts(1),
        updated_at=ts(2),
    )
    conn.commit()
    conn.close()
    return empty_store, portals, personas


def client(world: tuple[Store, Path, Path], service: Service | None = None) -> TestClient:
    store, portals, personas = world
    settings = Settings(
        data_dir=store.data_dir,
        default_env=store.env,
        ui_salvage="all",
        portals_dir=portals,
        personas_dir=personas,
    )
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(service or up())))


def up() -> Service:
    service = Service()
    service.routes[("GET", "/portals/shop")] = httpx2.Response(200, json=TWO_ENVS)
    return service


def test_settings_page_has_every_region(world: tuple[Store, Path, Path]) -> None:
    with client(world) as c:
        r = c.get("/portals/shop/settings")
    assert r.status_code == 200
    body, plain = r.text, text(r.text)
    assert body.count("<h1") == 1 and "Settings · shop" in plain
    for label in ("Environments", "Credentials", "Personas", "Crawl rules", "Hints", "Data store"):
        assert f">{label}</a>" in body
    assert "confirming an A/B test in Review adds its cookie" in plain  # spec 039 OV-2
    for anchor in ("env", "cred", "personas", "crawl", "hints", "store"):
        assert f'id="{anchor}"' in body
    assert "only look, never submit" in plain and "fill and submit forms (everything)" in plain
    assert body.count("sy-btn--primary") == 1 and "Save environment" in plain
    assert 'action="/portals/shop/environments"' in body
    assert "Runs already recorded are kept." in plain
    assert body.count('data-dialog="revoke-dialog"') == 2
    assert 'data-action="/portals/shop/environments/staging/revoke"' in body
    assert 'value="sandbox" selected' in body
    assert "sy-plate--intent" not in body


def test_credentials_are_collapsed_and_never_show_a_value(world: tuple[Store, Path, Path]) -> None:
    with client(world) as c:
        r = c.get("/portals/shop/settings")
        fragment = c.get("/fragments/portals/shop/credentials")
    body = r.text
    assert '<details class="sy-disclosure">' in body and "<details open" not in body
    assert "SHOP_LOGIN" in body and f">{ts(2)}<" in body and "staging" in body
    assert "1 stored" in text(body)
    for page in (body, fragment.text):
        assert SECRET not in page and 'type="password"' not in page and "***" not in page
    assert 'id="region-settings-credentials"' in fragment.text
    assert 'hx-get="/fragments/portals/shop/credentials"' in body


def test_credentials_empty_state(world: tuple[Store, Path, Path]) -> None:
    portals = world[1]
    (portals / "bare").mkdir()
    (portals / "bare" / "portal.yaml").write_text("id: bare\n")
    service = Service()
    service.routes[("GET", "/portals/bare")] = httpx2.Response(
        200, json={**TWO_ENVS, "portal": "bare"}
    )
    with client(world, service) as c:
        r = c.get("/portals/bare/settings")
    plain = text(r.text)
    assert "0 stored" in plain and "Nothing stored for bare" in plain
    assert "No persona files for bare" in plain


def test_personas_and_crawl_rules_and_store(world: tuple[Store, Path, Path]) -> None:
    store = world[0]
    with client(world) as c:
        r = c.get("/portals/shop/settings")
    plain = text(r.text)
    assert "client" in plain and "logged-in" in plain and "SHOP_LOGIN" in plain
    assert "guest" in plain and "anonymous" in plain
    # spec 024 attributes, as written, sorted by key
    assert "features export, share ; tariff premium" in plain
    assert "respect it" in plain and "shop.example.pl" in plain
    assert "Allowed URLs" in plain and "everything on the allowed domains" in plain
    assert "Disallowed URLs" in plain
    assert "/&lt;b&gt;admin/*" in r.text and "/<b>admin/*" not in r.text  # escaped
    assert str(store.path) in r.text and "read-only" in plain


def test_unreadable_portal_file_and_stopped_service(world: tuple[Store, Path, Path]) -> None:
    with client(world, Service(up=False)) as c:
        r = c.get("/portals/nope/settings")
    plain = text(r.text)
    assert "Assistant not running" in plain and "could not be read" in plain
    assert "disabled" in r.text


def test_drawer_has_no_page_context(world: tuple[Store, Path, Path]) -> None:
    with client(world) as c:
        r = c.get("/portals/shop/settings")
    assert "data-assistant-context=''" in r.text
    assert 'title="This page has no page context"' in r.text


def test_save_posts_through_the_existing_forwarder(world: tuple[Store, Path, Path]) -> None:
    from .test_chat import ORIGIN

    service = up()
    service.routes[("PUT", "/portals/shop/environments/sandbox")] = httpx2.Response(
        200, json=TWO_ENVS
    )
    with client(world, service) as c:
        r = c.post(
            "/portals/shop/environments",
            data={"environment": "sandbox", "base_url": "http://x.test/", "limit": "read"},
            headers=ORIGIN,
            follow_redirects=False,
        )
        saved = c.get("/portals/shop/settings", params={"saved": "<i>sandbox</i>"})
    assert r.status_code == 303
    assert "&lt;i&gt;sandbox" in saved.text and "<i>sandbox" not in saved.text


def test_screen_identity_shows_tau_labels_and_accepts_through_the_chat(
    world: tuple[Store, Path, Path],
) -> None:
    """Spec 039 owner answers 5 and 14: τ and the classifier are in force once a person accepts."""
    store, portals, personas = world
    conn = store.connect()
    insert(conn, "runs", id="r1", portal_id="shop")
    for n in range(3):
        insert(
            conn, "states", id=f"s{n}", portal_id="shop", first_seen_run="r1", fingerprint=f"fp{n}"
        )
    for a, b, label in (("s0", "s1", "clone"), ("s0", "s2", "distinct"), ("s1", "s2", "distinct")):
        conn.execute(
            "INSERT INTO state_pair_labels (portal_id, state_a, state_b, label, labelled_by,"
            " labelled_at) VALUES ('shop', ?, ?, ?, 'Anna', ?)",
            (a, b, label, ts(3)),
        )
    conn.commit()
    conn.close()
    service = up()
    service.routes[("POST", "/portals/shop/model/accept")] = httpx2.Response(
        409, json={"message": "no calibrated τ for shop yet: 1 same / 2 distinct labels"}
    )
    settings = Settings(
        data_dir=store.data_dir,
        default_env=store.env,
        ui_salvage="all",
        portals_dir=portals,
        personas_dir=personas,
        reviewer="Anna",
    )
    with TestClient(create_app(settings, chat_transport=httpx2.MockTransport(service))) as c:
        page = text(c.get("/portals/shop/settings").text)
        assert "Screen identity" in page and "1 same screen · 2 different screens" in page
        assert "the built-in default; none accepted yet" in page
        refused = c.post(
            "/portals/shop/model/accept",
            content="what=tau",
            headers={"Content-Type": "application/x-www-form-urlencoded", **ORIGIN},
        )
    assert "Not accepted: no calibrated τ for shop yet" in text(refused.text)
    sent = [r for r in service.requests if r.url.path == "/portals/shop/model/accept"]
    assert [json.loads(r.content) for r in sent] == [{"what": "tau", "by": "Anna"}]


def test_hints_and_budgets_are_saved_through_the_chat_service(
    world: tuple[Store, Path, Path],
) -> None:
    """Spec 040 T021 (12-v2-ux § 10): the forms send the portal file's hints and budgets."""
    service = up()
    service.routes[("PUT", "/portals/shop/hints")] = httpx2.Response(200, json=TWO_ENVS)
    form = {"Content-Type": "application/x-www-form-urlencoded", **ORIGIN}
    with client(world, service) as c:
        page = c.get("/portals/shop/settings").text
        assert (
            'id="budgets"' in page
            and 'name="checks_per_scan" min="0" max="1000" value="20"' in page
        )
        r = c.post(
            "/portals/shop/hints/hints",
            content="marker_header=x-app-version&marker_meta=&ab_flags=cookie+ab_calc%0Aexp.hero"
            "&refusals=Nie+mo%C5%BCemy%0A",
            headers=form,
            follow_redirects=False,
        )
        saved = c.get(r.headers["location"]).text
        c.post(
            "/portals/shop/hints/budgets",
            content="checks_per_scan=5&probes_per_step=12&probes_per_scan=60",
            headers=form,
        )
        bad = c.post(
            "/portals/shop/hints/budgets",
            content="checks_per_scan=-1&probes_per_step=12&probes_per_scan=60",
            headers=form,
        )
    assert r.headers["location"].endswith("#hints") and "Hints saved." in text(saved)
    assert "each budget is a whole number" in text(bad.text)
    sent = [json.loads(q.content) for q in service.requests if q.url.path == "/portals/shop/hints"]
    assert sent == [
        {
            "release_marker": {"header": "x-app-version", "meta": ""},
            "experiment_flags": [
                {"kind": "cookie", "name": "ab_calc"},
                {"kind": "cookie", "name": "exp.hero"},
            ],
            "business_errors": ["Nie możemy"],
        },
        {"replay_budget": 5, "probes": {"per_step": 12, "per_run": 60}},
    ]
