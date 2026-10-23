"""Review inbox fixtures (spec 022 screen 09, T029): the liveinsurer store with proposals and an
amendment to re-anchor, and a client with a reviewer. The Review API tests use them."""

from __future__ import annotations

import httpx2
import pytest
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store
from .test_chat import Service
from .test_chat_forms import seed_amendment
from .test_proposals import seeded


def client(store: Store, reviewer: str | None = "Anna") -> TestClient:
    settings = Settings(
        data_dir=store.data_dir, default_env=store.env, ui_salvage="all", reviewer=reviewer
    )
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(Service())))


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
