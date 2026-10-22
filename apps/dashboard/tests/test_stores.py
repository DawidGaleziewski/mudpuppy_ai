"""Spec 019 US5 (spec 015 F-21): eval workspaces are stores the BA can open from the picker."""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

import pytest

from mudpuppy_dashboard import stores

from .conftest import Store, insert, make_client, make_store

BANK_RUN = "run-eval-bank"


def eval_workspace(root: Path, name: str, portal: str, run_id: str, mtime: float) -> Path:
    """A `pnpm eval` workspace: `<root>/<name>/data/db/sandbox.sqlite` holding one run."""
    data_dir = root / name / "data"
    path = make_store(data_dir, "sandbox")
    conn = sqlite3.connect(path)
    insert(conn, "runs", id=run_id, portal_id=portal)
    conn.commit()
    conn.close()
    os.utime(path, (mtime, mtime))
    return data_dir


@pytest.fixture
def eval_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "tmp"
    root.mkdir()
    eval_workspace(root, "pf-eval-proving-ground-bank-AbC123", "proving-ground-bank", BANK_RUN, 2e9)
    eval_workspace(root, "pf-eval-proving-ground-shop-XyZ789", "proving-ground-shop", "r-s", 1e9)
    (root / "pf-eval-not-a-workspace").mkdir()  # no random suffix: not listed
    (root / "unrelated").mkdir()
    monkeypatch.setenv("MUDPUPPY_EVAL_ROOT", str(root))
    return root


def test_lists_eval_workspaces_newest_first_after_the_main_stores(
    empty_store: Store, eval_root: Path
) -> None:
    listed = stores.list_stores(empty_store.data_dir, eval_root)
    assert [s.key for s in listed] == [
        "main:test",
        "eval:pf-eval-proving-ground-bank-AbC123:sandbox",
        "eval:pf-eval-proving-ground-shop-XyZ789:sandbox",
    ]
    assert listed[1].label.startswith("eval · proving-ground-bank · ")
    with make_client(empty_store) as c:
        html = c.get("/").text
    menu = html.split('aria-label="Switch data store"')[1].split("</ul>")[0]
    assert "eval workspace" in menu
    assert menu.index("proving-ground-bank") < menu.index("proving-ground-shop")


def test_store_menu_lists_the_stores_holding_the_portal(
    empty_store: Store, eval_root: Path
) -> None:
    """R-71 (d): with a portal chosen, only stores with its runs (and the open one) are listed."""
    with make_client(empty_store) as c:
        c.cookies.set("pf_portal", "proving-ground-bank")
        html = c.get("/").text
    menu = html.split('aria-label="Switch data store"')[1].split("</ul>")[0]
    assert "store=eval%3Apf-eval-proving-ground-bank-AbC123%3Asandbox" in menu
    assert "proving-ground-shop" not in menu
    # The open store (no bank runs) stays listed, marked current, so the menu never hides it.
    assert menu.count("<li>") == 2 and 'aria-current="true">test' in menu


def test_portal_switch_lands_on_a_store_with_its_data(
    empty_store: Store, eval_root: Path, tmp_path: Path
) -> None:
    """R-71 (d): the main store has no shop runs, so the shop link opens the shop's eval store."""
    portals = tmp_path / "portals"  # its own config, not the repo's portals/
    (portals / "proving-ground-shop").mkdir(parents=True)
    (portals / "proving-ground-shop" / "portal.yaml").write_text("id: proving-ground-shop\n")
    with make_client(empty_store, portals_dir=portals) as c:
        html = c.get("/").text
    menu = html.split('aria-label="Switch portal"')[1].split("</ul>")[0]
    assert "store=eval%3Apf-eval-proving-ground-shop-XyZ789%3Asandbox" in menu


def test_opens_an_eval_store_and_keeps_it_on_links(empty_store: Store, eval_root: Path) -> None:
    key = "eval:pf-eval-proving-ground-bank-AbC123:sandbox"
    with make_client(empty_store) as c:
        page = c.get("/", params={"store": key})
        run = c.get(f"/runs/{BANK_RUN}", params={"store": key})
    assert "Reading the eval workspace" in page.text
    assert "pf-eval-proving-ground-bank-AbC123" in page.text
    assert "store=eval%3Apf-eval-proving-ground-bank-AbC123%3Asandbox" in page.text
    assert run.status_code == 200


def test_a_vanished_or_forged_key_falls_back_to_the_default_store(
    empty_store: Store, eval_root: Path
) -> None:
    with make_client(empty_store) as c:
        gone = c.get("/", params={"store": "eval:pf-eval-proving-ground-bank-Gone00:sandbox"})
        forged = c.get("/", params={"store": "eval:../../etc:passwd"})
    assert "That eval workspace is gone" in gone.text
    assert "That eval workspace is gone" in forged.text


def test_serves_evidence_from_an_eval_workspace(empty_store: Store, eval_root: Path) -> None:
    ref = "c" * 64 + ".png"
    evidence = eval_root / "pf-eval-proving-ground-bank-AbC123" / "data" / "evidence"
    evidence.mkdir(parents=True)
    (evidence / ref).write_bytes(b"\x89PNG\r\n\x1a\n")
    with make_client(empty_store) as c:
        r = c.get(f"/evidence/{ref}")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"


def test_stores_with_portal_names_only_stores_holding_its_runs(
    empty_store: Store, eval_root: Path
) -> None:
    listed = stores.list_stores(empty_store.data_dir, eval_root)
    found = stores.stores_with_portal(listed, "proving-ground-bank")
    assert [s.key for s in found] == ["eval:pf-eval-proving-ground-bank-AbC123:sandbox"]


def test_an_empty_portal_names_the_stores_that_hold_it(empty_store: Store, eval_root: Path) -> None:
    with make_client(empty_store) as c:
        here = c.get("/docs/proving-ground-bank")
        nowhere = c.get("/docs/never-scanned")
    assert here.status_code == 200
    assert "Nothing recorded for proving-ground-bank in this store" in here.text
    assert "store=eval%3Apf-eval-proving-ground-bank-AbC123%3Asandbox" in here.text
    assert "proving-ground-shop" not in here.text.split("<main")[1]
    assert nowhere.status_code == 404
