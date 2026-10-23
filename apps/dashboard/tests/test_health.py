"""`/healthz` (the smoke check's first call): the store in use and whether it exists."""

from pathlib import Path

from fastapi.testclient import TestClient

from .conftest import Store, make_client


def test_healthz(client: TestClient, tmp_path: Path) -> None:
    body = client.get("/healthz").json()
    assert body["ok"] is True and body["store"]["environment"] == "test"
    empty = tmp_path / "nodata"
    (empty / "db").mkdir(parents=True)
    with make_client(Store(empty, "production", empty / "db" / "production.sqlite")) as c:
        r = c.get("/healthz")
    assert r.status_code == 503 and r.json()["ok"] is False
