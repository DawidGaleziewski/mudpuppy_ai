"""FR-012 / FR-014: the CLI serves on the local machine only; --dev turns on reload."""

import pytest

from pathfinder_dashboard import __main__


@pytest.fixture
def captured(monkeypatch: pytest.MonkeyPatch) -> dict:
    calls: dict = {}
    monkeypatch.setattr(__main__.uvicorn, "run", lambda *a, **kw: calls.update(kw))
    # setenv first so monkeypatch records the variable and removes what main() sets afterwards;
    # a bare delenv(raising=False) on an unset variable records nothing and leaks into later tests.
    names = ("PATHFINDER_DEV", "PATHFINDER_PORT", "PATHFINDER_DEFAULT_ENV", "PATHFINDER_DATA_DIR")
    for var in names:
        monkeypatch.setenv(var, "")
        monkeypatch.delenv(var)
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
