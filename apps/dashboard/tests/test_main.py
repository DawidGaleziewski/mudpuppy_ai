"""FR-012 / FR-014: the CLI serves on the local machine only; --dev turns on reload."""

import pytest

from pathfinder_dashboard import __main__


@pytest.fixture
def captured(monkeypatch: pytest.MonkeyPatch) -> dict:
    calls: dict = {}
    monkeypatch.setattr(__main__.uvicorn, "run", lambda *a, **kw: calls.update(kw))
    for var in ("PATHFINDER_DEV", "PATHFINDER_PORT", "PATHFINDER_DEFAULT_ENV"):
        monkeypatch.delenv(var, raising=False)
    return calls


def test_binds_localhost_without_reload(captured: dict) -> None:
    __main__.main([])
    assert captured["host"] == "127.0.0.1"
    assert captured["port"] == 8765
    assert captured["reload"] is False
    assert captured["factory"] is True
    assert captured["timeout_graceful_shutdown"] == 1


def test_dev_reloads_on_templates_and_assets(captured: dict) -> None:
    __main__.main(["--dev", "--port", "9001", "--env", "scratch"])
    assert captured["reload"] is True
    assert captured["port"] == 9001
    assert {"*.py", "*.html", "*.css", "*.js"} <= set(captured["reload_includes"])
