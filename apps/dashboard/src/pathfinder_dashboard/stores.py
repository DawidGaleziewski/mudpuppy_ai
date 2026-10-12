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


def stores_with_portal(stores: list[Store], portal: str) -> list[Store]:
    """The stores whose runs include `portal` (the empty-portal page lists them, AS5.3)."""
    out: list[Store] = []
    for s in stores:
        try:
            conn = db.connect(s.data_dir, s.env)
        except db.StoreMissing:
            continue
        try:
            row = conn.execute(
                "SELECT 1 FROM runs WHERE portal_id = ? LIMIT 1", (portal,)
            ).fetchone()
        except sqlite3.Error:  # a store of an older schema or a locked file: not listed
            row = None
        finally:
            conn.close()
        if row is not None:
            out.append(s)
    return out
