"""Spec 031 US2 (R-61): the header names the environment; live servers that disagree are named."""

from __future__ import annotations

import json
import os
from pathlib import Path

from mudpuppy_dashboard import servers

from .conftest import Store, make_client

DEAD_PID = 2**22 + 12345  # above Linux's default pid_max: never a live process


def register(data_dir: Path, pid: int, env: str, code_root: Path) -> None:
    folder = data_dir / "servers"
    folder.mkdir(parents=True, exist_ok=True)
    entry = {"pid": pid, "environment": env, "codeRoot": f"{code_root}/", "server": "mudpuppy"}
    (folder / f"{pid}.json").write_text(json.dumps(entry), encoding="utf-8")


def test_live_servers_skip_dead_and_broken_files_without_deleting_them(tmp_path: Path) -> None:
    register(tmp_path, os.getpid(), "sandbox", tmp_path)
    register(tmp_path, DEAD_PID, "sandbox", tmp_path)
    (tmp_path / "servers" / "broken.json").write_text("{", encoding="utf-8")
    live = servers.live_servers(tmp_path)
    assert [e.pid for e in live] == [os.getpid()]
    assert (tmp_path / "servers" / f"{DEAD_PID}.json").exists()


def test_stray_warnings_name_environment_and_checkout(tmp_path: Path) -> None:
    other = tmp_path / "other-checkout"
    entries = [
        servers.ServerEntry(1, "sandbox", tmp_path.resolve(), "mudpuppy"),
        servers.ServerEntry(2, "production", tmp_path.resolve(), "mudpuppy-ba"),
        servers.ServerEntry(3, "sandbox", other.resolve(), "mudpuppy"),
    ]
    assert servers.stray_warnings(entries, "sandbox", tmp_path) == [
        'mudpuppy-ba pid 2 serves environment "production"; this page shows "sandbox".',
        f"mudpuppy pid 3 runs from another checkout ({other.resolve()}).",
    ]


def test_the_api_names_the_environment_and_agreeing_servers_say_nothing(
    empty_store: Store,
) -> None:
    portals = empty_store.data_dir.parent / "portals"
    register(empty_store.data_dir, os.getpid(), empty_store.env, portals.parent)
    with make_client(empty_store, portals_dir=portals) as c:
        body = c.get("/api/portals").json()
    assert body["environment"] == empty_store.env and body["warnings"] == []


def test_a_server_on_another_environment_is_named(empty_store: Store) -> None:
    portals = empty_store.data_dir.parent / "portals"
    register(empty_store.data_dir, os.getpid(), "production", portals.parent)
    with make_client(empty_store, portals_dir=portals) as c:
        (warning,) = c.get("/api/portals").json()["warnings"]
    assert 'serves environment "production"; this page shows "test"' in warning
