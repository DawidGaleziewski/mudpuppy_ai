"""The estate's whole state, in memory (research §2).

Seeded from ``seed/*.json`` (one key per file stem) plus the users file; ``reset()`` restores the
seed, so a test or a crawl can always start from the same data. Every mutation goes through
``with STORE.lock:``.
"""

import copy
import json
import threading
from pathlib import Path
from typing import Any

from . import config

SEED_DIR = Path(__file__).resolve().parent / "seed"


def _load_seed() -> dict[str, Any]:
    data: dict[str, Any] = {}
    for f in sorted(SEED_DIR.glob("*.json")):
        data[f.stem] = json.loads(f.read_text(encoding="utf-8"))
    return data


def _load_users(path: Path) -> list[dict[str, str]]:
    """``{"users": [{"id", "brand", "login", "hash"}]}``; hashes only, never passwords."""
    if not path.exists():
        return []
    users = json.loads(path.read_text(encoding="utf-8")).get("users", [])
    for u in users:
        missing = {"id", "brand", "login", "hash"} - u.keys()
        if missing:
            raise ValueError(f"{path}: user {u.get('id')} lacks {sorted(missing)}")
    return users


class Store:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.seed: dict[str, Any] = {}
        self.data: dict[str, Any] = {}
        self.users: list[dict[str, str]] = []
        self.reset()

    def reset(self) -> None:
        with self.lock:
            self.seed = _load_seed()
            self.users = _load_users(config.CONFIG.seed_users)
            self.data = copy.deepcopy(self.seed)
            # Per-session and per-user runtime state, empty after every reset.
            self.data["sessions"] = {}
            self.data["failed_logins"] = {}
            self.data["carts"] = {}
            self.data["orders"] = []
            self.data["transfers"] = []
            self.data["claims"] = {}
            self.data["claims_filed"] = []
            self.data["rate"] = {}

    def user_by_login(self, login: str) -> dict[str, str] | None:
        return next((u for u in self.users if u["login"] == login), None)

    def user(self, user_id: str) -> dict[str, str] | None:
        return next((u for u in self.users if u["id"] == user_id), None)


STORE = Store()
