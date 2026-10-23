"""Portal fixtures (spec 011, R-31): configured portal files, scanned runs and a client over a
mocked chat service, shared by the portal and Settings API tests."""

import json
from pathlib import Path

import httpx2
from fastapi.testclient import TestClient

from mudpuppy_dashboard.settings import Settings

from .conftest import Store, insert, ts
from .test_chat import Service


def client(store: Store, service: Service, portals: Path) -> TestClient:
    from mudpuppy_dashboard.app import create_app

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
