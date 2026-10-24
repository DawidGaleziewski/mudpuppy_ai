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


def test_the_picker_lists_the_stores_holding_the_portal(
    empty_store: Store, eval_root: Path
) -> None:
    """R-71 (d): with a portal chosen, only stores with its runs (and the open one) are listed."""
    with make_client(empty_store) as c:
        every = c.get("/api/stores").json()
        bank = c.get("/api/stores", params={"portal": "proving-ground-bank"}).json()
    assert every["stores"][0]["key"] == "main:test"
    assert len(every["stores"]) == 3 and every["note"] is None
    # The open store (no bank runs) stays listed first, so the menu never hides it.
    assert [s["key"] for s in bank["stores"]] == [
        "main:test",
        "eval:pf-eval-proving-ground-bank-AbC123:sandbox",
    ]
    assert bank["stores"][1]["workspace"] == "pf-eval-proving-ground-bank-AbC123"


def test_every_api_address_reads_the_store_asked_for(empty_store: Store, eval_root: Path) -> None:
    key = "eval:pf-eval-proving-ground-bank-AbC123:sandbox"
    with make_client(empty_store) as c:
        picker = c.get("/api/stores", params={"store": key}).json()
        scans = c.get("/api/portals/proving-ground-bank/scans", params={"store": key}).json()
        main = c.get("/api/portals/proving-ground-bank/scans").json()
    assert picker["current"]["key"] == key and picker["current"]["kind"] == "eval"
    assert BANK_RUN in str(scans) and BANK_RUN not in str(main)


def test_a_vanished_or_forged_key_falls_back_to_the_default_store(
    empty_store: Store, eval_root: Path
) -> None:
    with make_client(empty_store) as c:
        gone = c.get(
            "/api/stores", params={"store": "eval:pf-eval-proving-ground-bank-Gone00:sandbox"}
        )
        forged = c.get("/api/stores", params={"store": "eval:../../etc:passwd"})
    for r in (gone.json(), forged.json()):
        assert r["current"]["key"] == "main:test"
        assert r["note"] == "That eval workspace is gone; showing the default store."


def test_serves_evidence_from_an_eval_workspace(empty_store: Store, eval_root: Path) -> None:
    ref = "c" * 64 + ".png"
    evidence = eval_root / "pf-eval-proving-ground-bank-AbC123" / "data" / "evidence"
    evidence.mkdir(parents=True)
    (evidence / ref).write_bytes(b"\x89PNG\r\n\x1a\n")
    with make_client(empty_store) as c:
        r = c.get(f"/evidence/{ref}")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"


def test_the_store_follows_the_portal(empty_store: Store, eval_root: Path) -> None:
    """R-71 (d), R-103 (3): a switch to a portal the open store lacks lands on one holding it;
    the open store stays when it holds the portal, or when no store does."""
    shop_ws = "eval:pf-eval-proving-ground-shop-XyZ789:sandbox"
    with make_client(empty_store) as c:
        bank = c.get("/api/stores", params={"portal": "proving-ground-bank"}).json()
        shop_in_ws = c.get(
            "/api/stores", params={"portal": "proving-ground-shop", "store": shop_ws}
        ).json()
        nowhere = c.get("/api/stores", params={"portal": "never-scanned"}).json()
    assert bank["follow"]["key"] == "eval:pf-eval-proving-ground-bank-AbC123:sandbox"
    assert shop_in_ws["current"]["key"] == shop_ws and shop_in_ws["follow"] is None
    assert nowhere["follow"] is None


def test_stores_with_portal_names_only_stores_holding_its_runs(
    empty_store: Store, eval_root: Path
) -> None:
    listed = stores.list_stores(empty_store.data_dir, eval_root)
    found = stores.stores_with_portal(listed, "proving-ground-bank")
    assert [s.key for s in found] == ["eval:pf-eval-proving-ground-bank-AbC123:sandbox"]
