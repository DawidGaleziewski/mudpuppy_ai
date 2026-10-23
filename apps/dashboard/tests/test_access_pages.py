"""Spec 024 US2 fixtures: the shared three-personas store (portal access-shop; sc-home, sc-account,
sc-admin) with persona files, for the Access API tests."""

from __future__ import annotations

from pathlib import Path

import httpx2
import pytest
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store
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
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(Service())))
