"""Spec 031 US2 (R-61): the header names the environment; live servers that disagree are named."""

from __future__ import annotations

import json
import os
from pathlib import Path

from pathfinder_dashboard import servers

from .conftest import Store, make_client

DEAD_PID = 2**22 + 12345  # above Linux's default pid_max: never a live process


def register(data_dir: Path, pid: int, env: str, code_root: Path) -> None:
    folder = data_dir / "servers"
    folder.mkdir(parents=True, exist_ok=True)
    entry = {"pid": pid, "environment": env, "codeRoot": f"{code_root}/", "server": "pathfinder"}
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
        servers.ServerEntry(1, "sandbox", tmp_path.resolve(), "pathfinder"),
        servers.ServerEntry(2, "production", tmp_path.resolve(), "pathfinder-ba"),
        servers.ServerEntry(3, "sandbox", other.resolve(), "pathfinder"),
    ]
    assert servers.stray_warnings(entries, "sandbox", tmp_path) == [
        'pathfinder-ba pid 2 serves environment "production"; this page shows "sandbox".',
        f"pathfinder pid 3 runs from another checkout ({other.resolve()}).",
    ]


def test_header_names_the_environment_and_agreeing_servers_say_nothing(
    empty_store: Store,
) -> None:
    portals = empty_store.data_dir.parent / "portals"
    register(empty_store.data_dir, os.getpid(), empty_store.env, portals.parent)
    with make_client(empty_store, portals_dir=portals) as c:
        html = c.get("/").text
    assert 'id="header-env"' in html
    assert f'<span class="sy-mono">{empty_store.env}</span>' in html
    assert 'id="stray-servers"' not in html


def test_a_server_on_another_environment_is_named_on_every_page(empty_store: Store) -> None:
    portals = empty_store.data_dir.parent / "portals"
    register(empty_store.data_dir, os.getpid(), "production", portals.parent)
    with make_client(empty_store, portals_dir=portals) as c:
        html = c.get("/").text
    assert 'id="stray-servers"' in html
    assert "serves environment &#34;production&#34;; this page shows &#34;test&#34;" in html
