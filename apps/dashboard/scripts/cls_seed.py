"""Seeds a temp data dir for `cls:ci` from the dashboard tests' own fixtures (no invented data).

    uv run python scripts/cls_seed.py <data_dir>

Two stores in `<data_dir>/db/`, each built with every migration (`tests.conftest.make_store`):
`test` holds the `reference-insurer` runs, states and Layer B records (`seed_ba`); `procs` holds
the `liveinsurer` processes with a draft and a suggestion (`tests.test_processes_pages.seed`). They
cannot share one file (both fixtures use the same state ids). Prints one JSON line with the ids
the console routes need.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.conftest import Store, make_store, seed_ba
from tests.test_processes_pages import seed as seed_processes


def first(path: Path, sql: str) -> str:
    conn = sqlite3.connect(path)
    try:
        return str(conn.execute(sql).fetchone()[0])
    finally:
        conn.close()


def column(path: Path, sql: str) -> list[str]:
    conn = sqlite3.connect(path)
    try:
        return [str(r[0]) for r in conn.execute(sql)]
    finally:
        conn.close()


def main(data_dir: Path) -> dict[str, object]:
    docs = Store(data_dir, "test", make_store(data_dir, "test"))
    conn = docs.connect()
    seed_ba(conn)
    conn.commit()
    conn.close()
    procs = Store(data_dir, "procs", make_store(data_dir, "procs"))
    seed_processes(procs)  # opens its own connection and commits
    return {
        "docs": {
            "env": "test",
            "portal": "reference-insurer",
            "run": first(docs.path, "SELECT id FROM runs WHERE mode = 'trace' LIMIT 1"),
            "state": first(docs.path, "SELECT id FROM states ORDER BY id LIMIT 1"),
            "records": column(docs.path, "SELECT key FROM doc_records ORDER BY key"),
            "sessions": column(docs.path, "SELECT id FROM analysis_sessions ORDER BY id"),
        },
        "procs": {
            "env": "procs",
            "portal": "liveinsurer",
            "run": first(procs.path, "SELECT id FROM runs LIMIT 1"),
            "process": first(procs.path, "SELECT key FROM ba_processes LIMIT 1"),
        },
    }


if __name__ == "__main__":
    print(json.dumps(main(Path(sys.argv[1]))))
