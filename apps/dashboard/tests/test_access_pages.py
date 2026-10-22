"""Spec 024 US2 views: the screen page's Access tab and the /access matrix, over the shared
three-personas fixture (portal access-shop; sc-home, sc-account, sc-admin)."""

from __future__ import annotations

import re
from html import unescape
from pathlib import Path

import httpx2
import pytest
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store
from .test_access import load_fixture
from .test_chat import Service


@pytest.fixture
def personas_dir(tmp_path: Path) -> Path:
    d = tmp_path / "personas" / "access-shop"
    d.mkdir(parents=True)
    (d / "basic.yaml").write_text("attributes: { tariff: basic }\n")
    (d / "premium.yaml").write_text("attributes: { tariff: premium, features: [export, share] }\n")
    return tmp_path / "personas"


def client(store: Store, personas: Path) -> TestClient:
    settings = Settings(
        data_dir=store.data_dir, default_env=store.env, ui_salvage="all", personas_dir=personas
    )
    c = TestClient(create_app(settings, chat_transport=httpx2.MockTransport(Service())))
    c.cookies.set("pf_portal", "access-shop")
    return c


def squash(html: str) -> str:
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", html)))


def test_access_tab_lists_elements_attributes_and_uncounted_personas(
    empty_store: Store, personas_dir: Path
) -> None:
    load_fixture(empty_store)
    r = client(empty_store, personas_dir).get("/states/st-home-2?side=access")
    assert r.status_code == 200
    text = squash(r.text)
    assert r.text.count("<h1") == 1
    assert 'button "Export"' in text
    row = re.search(r"button &#34;Export&#34;</span>(.*?)</th>(.*?)</tr>", r.text, re.S)
    assert row is not None
    assert squash(row.group(1)).strip() == "BR-001"
    seen, not_seen = re.findall(r"<td[^>]*>(.*?)</td>", row.group(2), re.S)
    assert squash(seen).strip() == "b2b, premium"
    assert squash(not_seen).strip() == "basic"
    # guest reached the screen only outside a completed map run
    assert "Only in an interrupted or trace run: not counted as not shown." in text
    # attributes from the persona files; guest has no file
    assert "tariff: premium · features: export, share" in text
    assert "tariff: basic" in text
    assert "no attributes" in text
    assert re.search(r"Access\s*<span[^>]*>1</span>", r.text)


def test_access_tab_names_who_never_reached_the_screen(
    empty_store: Store, personas_dir: Path
) -> None:
    load_fixture(empty_store)
    r = client(empty_store, personas_dir).get("/states/st-admin-1?side=access")
    assert r.status_code == 200
    assert "Not reached by" in r.text
    assert "basic, premium" in squash(r.text)


def test_access_tab_says_when_every_persona_sees_the_same(
    empty_store: Store, personas_dir: Path
) -> None:
    load_fixture(empty_store)
    r = client(empty_store, personas_dir).get("/states/st-admin-1?side=access")
    assert r.status_code == 200
    assert "Every persona that reached this screen sees the same elements (1)." in squash(r.text)


def test_access_fragment_and_unknown_state(empty_store: Store, personas_dir: Path) -> None:
    load_fixture(empty_store)
    c = client(empty_store, personas_dir)
    frag = c.get("/fragments/states/st-home-2/access")
    assert frag.status_code == 200
    assert 'id="region-state-access"' in frag.text
    assert c.get("/fragments/states/nope/access").status_code == 404


def test_matrix_lists_screens_personas_and_gaps(empty_store: Store, personas_dir: Path) -> None:
    fx = load_fixture(empty_store)
    r = client(empty_store, personas_dir).get("/access")
    assert r.status_code == 200
    assert r.text.count("<h1") == 1
    assert "sy-btn--primary" not in r.text
    text = squash(r.text)
    for route in ("/", "/account", "/admin"):
        assert f">{route}</span>" in r.text
    for persona in fx["expected"]["personas"]:
        assert persona in text
    assert "tariff: basic" in text
    assert "Differs" in text
    admin = re.search(r"<tr>\s*<th scope=\"row\">(?:(?!</tr>).)*/admin.*?</tr>", r.text, re.S)
    assert admin is not None
    cells = re.findall(r"<td[^>]*>(.*?)</td>", admin.group(0), re.S)
    # one cell per persona, then the element count and the status
    assert len(cells) == len(fx["expected"]["personas"]) + 2
    # basic, guest and premium never got to /admin
    assert sum("—" in cell for cell in cells) == 3
    assert 'id="region-access"' in r.text
    assert "Access by persona" in client(empty_store, personas_dir).get("/screens").text


def test_matrix_needs_a_portal_and_escapes(empty_store: Store, personas_dir: Path) -> None:
    load_fixture(empty_store)
    c = client(empty_store, personas_dir)
    c.cookies.clear()
    r = c.get("/access")
    assert r.status_code == 200
    assert "No portal chosen" in r.text
    r = c.get("/access?portal=no-runs")
    assert "No screens observed yet" in r.text


def test_attributes_are_escaped(empty_store: Store, personas_dir: Path) -> None:
    load_fixture(empty_store)
    (personas_dir / "access-shop" / "basic.yaml").write_text(
        "attributes: { note: '<script>x</script>' }\n"
    )
    r = client(empty_store, personas_dir).get("/access")
    assert "<script>x</script>" not in r.text
    assert "&lt;script&gt;x&lt;/script&gt;" in r.text
