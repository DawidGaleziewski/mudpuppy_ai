"""Settings fixtures (spec 022 T031; FE-T01, FE-T02): a portal file, two persona files and one
stored credential, with a client whose chat service knows the portal's environments. The
Settings API tests use them."""

from __future__ import annotations

from pathlib import Path

import httpx2
import pytest
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store, insert, ts
from .test_chat import Service
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
