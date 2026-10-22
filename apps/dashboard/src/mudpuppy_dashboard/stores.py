"""Which crawl stores the dashboard can open (spec 019 US5, spec 015 F-21).

A store is a data directory plus an environment (`<data_dir>/db/<env>.sqlite`). Besides the main
data directory's stores, every eval workspace on this machine is one (`<tmp>/pf-eval-<portal>-*`,
written by `pnpm eval`), so the BA finds an eval's data from the store picker instead of a command
line. A store is chosen by key and resolved here; a path from a request is never opened.
"""

from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal

from . import db

EVAL_DIR = re.compile(r"^pf-eval-(?P<portal>[a-z0-9][a-z0-9_-]*?)-[A-Za-z0-9]{6}$")
ENV_NAME = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


@dataclass(frozen=True)
class Store:
    key: str
    label: str
    data_dir: Path
    env: str
    kind: Literal["main", "eval"]
    # Seconds since the epoch of the store file's last write; orders eval workspaces newest first.
    mtime: float
    portal: str | None = None


def _mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0


def main_stores(data_dir: Path) -> list[Store]:
    return [
        Store(f"main:{env}", env, data_dir, env, "main", _mtime(db.store_path(data_dir, env)))
        for env in db.list_environments(data_dir)
    ]


def eval_stores(eval_root: Path | None) -> list[Store]:
    """Eval workspaces under `eval_root`, newest first; unreadable ones are left out."""
    if eval_root is None or not eval_root.is_dir():
        return []
    out: list[Store] = []
    for workspace in eval_root.iterdir():
        m = EVAL_DIR.match(workspace.name)
        if not m or not workspace.is_dir():
            continue
        data_dir = workspace / "data"
        for env in db.list_environments(data_dir):
            mtime = _mtime(db.store_path(data_dir, env))
            when = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M")
            out.append(
                Store(
                    key=f"eval:{workspace.name}:{env}",
                    label=f"eval · {m['portal']} · {when}",
                    data_dir=data_dir,
                    env=env,
                    kind="eval",
                    mtime=mtime,
                    portal=m["portal"],
                )
            )
    return sorted(out, key=lambda s: s.mtime, reverse=True)


def list_stores(data_dir: Path, eval_root: Path | None) -> list[Store]:
    """Main stores first (production first, as before), then eval workspaces newest first."""
    return main_stores(data_dir) + eval_stores(eval_root)


def resolve_store(
    data_dir: Path,
    eval_root: Path | None,
    key: str | None,
    env: str | None,
    default_env: str,
) -> tuple[Store, str | None]:
    """The store a request asks for (`?store=`, else the older `?env=`), and a note when it is
    gone: an eval workspace deleted since the link was made falls back to the default store."""
    if key and key.startswith("eval:"):
        for s in eval_stores(eval_root):
            if s.key == key:
                return s, None
        note = "That eval workspace is gone; showing the default store."
        return _main(data_dir, None, default_env), note
    if key and key.startswith("main:") and ENV_NAME.match(key[5:]):
        env = key[5:]
    return _main(data_dir, env, default_env), None


def _main(data_dir: Path, env: str | None, default_env: str) -> Store:
    resolved = db.resolve_env(data_dir, env, default_env)
    return Store(
        f"main:{resolved}",
        resolved,
        data_dir,
        resolved,
        "main",
        _mtime(db.store_path(data_dir, resolved)),
    )


# Portals per store file, keyed by the file's and its WAL's write times, so the header asks each
# store once per change instead of on every page (R-71 (d)).
_PORTALS: dict[tuple[str, float, float], frozenset[str]] = {}


def portals_in(s: Store) -> frozenset[str]:
    """The portals with at least one run in a store; empty for a missing or unreadable one."""
    path = db.store_path(s.data_dir, s.env)
    key = (str(path), _mtime(path), _mtime(path.with_name(path.name + "-wal")))
    if key in _PORTALS:
        return _PORTALS[key]
    try:
        conn = db.connect(s.data_dir, s.env)
    except db.StoreMissing:
        return frozenset()
    try:
        found = frozenset(r[0] for r in conn.execute("SELECT DISTINCT portal_id FROM runs"))
    except sqlite3.Error:  # a store of an older schema or a locked file: not listed
        found = frozenset()
    finally:
        conn.close()
    _PORTALS[key] = found
    return found


def stores_with_portal(stores: list[Store], portal: str) -> list[Store]:
    """The stores whose runs include `portal` (the empty-portal page and the header's store
    picker list them, AS5.3, R-71 (d)), in `list_stores` order."""
    return [s for s in stores if portal in portals_in(s)]


def store_for_portal(stores: list[Store], current: Store, portal: str) -> Store:
    """The store a switch to `portal` lands on (R-71 (d)): the current one when it holds the
    portal, else the first that does, else the current one (a portal not scanned yet)."""
    if portal in portals_in(current):
        return current
    holding = stores_with_portal(stores, portal)
    return holding[0] if holding else current
