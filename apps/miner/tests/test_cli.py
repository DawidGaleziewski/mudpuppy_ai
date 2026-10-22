import json
import sqlite3
from pathlib import Path

import pytest

from mudpuppy_miner.__main__ import main
from mudpuppy_miner.store import open_read_only


def test_check_reports_every_library(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["check"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["ok"] is True
    assert set(out["libraries"]) == {"scikit-learn", "igraph", "leidenalg"}


def test_rules_and_communities_need_an_input_file(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["rules"]) == 2
    assert "--in" in json.loads(capsys.readouterr().out)["error"]
    assert main(["communities"]) == 2


def test_store_is_opened_read_only(tmp_path: Path) -> None:
    db = tmp_path / "s.sqlite"
    sqlite3.connect(db).execute("CREATE TABLE t (x)").connection.commit()
    con = open_read_only(db)
    with pytest.raises(sqlite3.OperationalError):
        con.execute("INSERT INTO t VALUES (1)")


def test_missing_store_is_never_created(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        open_read_only(tmp_path / "none.sqlite")
    assert not (tmp_path / "none.sqlite").exists()
