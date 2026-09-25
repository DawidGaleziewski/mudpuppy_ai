"""Fixture stores built from the real migrations, so tests see exactly the crawler's schema."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pathfinder_dashboard.app import create_app
from pathfinder_dashboard.settings import Settings

REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATIONS = sorted((REPO_ROOT / "data" / "migrations").glob("*.up.sql"))

T0 = "2026-09-25T19:00:00.000Z"
EVIDENCE = "a" * 64 + ".json"


def ts(minute: int, second: int = 0) -> str:
    """UTC ISO timestamp `minute` minutes after T0, in the crawler's format."""
    h, m = divmod(minute, 60)
    return f"2026-09-25T{19 + h:02d}:{m:02d}:{second:02d}.000Z"


def make_store(data_dir: Path, env: str = "test") -> Path:
    """Create `<data_dir>/db/<env>.sqlite` with every up-migration applied, in WAL mode."""
    db_dir = data_dir / "db"
    db_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "migrations").mkdir(exist_ok=True)
    path = db_dir / f"{env}.sqlite"
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute(
        "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL,"
        " applied_at TEXT NOT NULL) STRICT"
    )
    for i, migration in enumerate(MIGRATIONS, start=1):
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.executescript(migration.read_text())
        conn.execute("INSERT INTO schema_migrations VALUES (?, ?, ?)", (i, migration.stem, T0))
    conn.commit()
    conn.close()
    return path


DEFAULTS: dict[str, dict[str, object]] = {
    "runs": {
        "portal_id": "liveinsurer",
        "persona_id": "guest",
        "mode": "map",
        "environment": "production",
        "env_version_or_date": "2026-09-25",
        "seed_id": None,
        "viewport": "1280x800",
        "locale": "pl-PL",
        "browser": "chromium",
        "config_snapshot": json.dumps({"portal": {"id": "liveinsurer"}}),
        "status": "interrupted",
        "warning": None,
        "steps_used": 0,
        "elapsed_ms": 0,
        "max_depth_reached": 0,
        "started_at": T0,
        "ended_at": None,
        "coverage": None,
    },
    "states": {
        "portal_id": "liveinsurer",
        "fingerprint": "fp",
        "cluster_id": "cluster-1",
        "route_template": "/",
        "title": "Home",
        "evidence_ref": EVIDENCE,
        "confidence": "observed",
        "stabilization": "settled",
        "created_at": T0,
    },
    "state_observations": {"persona_id": "guest", "evidence_ref": EVIDENCE, "observed_at": T0},
    "actions": {
        "role": "link",
        "accessible_name": "Link",
        "action_json": json.dumps({"kind": "click"}),
        "safety_class": "read",
        "allowed": 1,
        "skip_reason": None,
        "created_at": T0,
    },
    "edges": {
        "to_state": None,
        "action_json": json.dumps({"kind": "click"}),
        "safety_class": "read",
        "status": "executed",
        "evidence_ref": EVIDENCE,
        "confidence": "observed",
        "error": None,
        "stabilization": "settled",
        "created_at": T0,
    },
    "forms": {
        "fields_json": json.dumps([{"name": "q", "type": "search", "required": False}]),
        "evidence_ref": EVIDENCE,
        "confidence": "observed",
        "created_at": T0,
    },
    "network_calls": {
        "edge_id": None,
        "method": "GET",
        "url_template": "/api/:param",
        "status": 200,
        "req_schema": "{}",
        "res_schema": json.dumps({"type": "object"}),
        "console_errors": "[]",
        "created_at": T0,
    },
    "open_questions": {"about_ref": "s", "status": "open", "created_at": T0},
    "rule_candidates": {
        "about_ref": "s",
        "evidence_ref": EVIDENCE,
        "confidence": "inferred",
        "created_at": T0,
    },
    "frontier": {
        "action_id": None,
        "action_json": json.dumps({"kind": "click"}),
        "safety_class": "read",
        "status": "pending",
        "priority": 0,
        "depth": 0,
        "reason": None,
        "created_at": T0,
        "updated_at": T0,
    },
    "decision_log": {
        "rule": None,
        "subject_ref": None,
        "detail_json": None,
        "created_at": T0,
    },
    "robots_policies": {
        "host": "www.liveinsurer.example",
        "source_url": "https://www.liveinsurer.example/robots.txt",
        "final_url": "https://www.liveinsurer.example/robots.txt",
        "outcome": "rules",
        "http_status": 200,
        "product_token": "pathfinder",
        "group_used": "*",
        "crawl_delay_s": None,
        "ignored_lines": 0,
        "truncated": 0,
        "content_sha256": "b" * 64,
        "evidence_ref": EVIDENCE,
        "fetched_at": T0,
    },
}


def insert(conn: sqlite3.Connection, table: str, **row: object) -> None:
    """Insert one row, filling the table's defaults for columns not given."""
    full = {**DEFAULTS.get(table, {}), **row}
    cols = ", ".join(full)
    marks = ", ".join("?" for _ in full)
    conn.execute(f"INSERT INTO {table} ({cols}) VALUES ({marks})", tuple(full.values()))


@dataclass
class Store:
    data_dir: Path
    env: str
    path: Path

    def connect(self) -> sqlite3.Connection:
        """A writable connection, for tests that play the crawler."""
        conn = sqlite3.connect(self.path)
        conn.execute("PRAGMA foreign_keys = ON")
        return conn


@pytest.fixture
def empty_store(tmp_path: Path) -> Store:
    data_dir = tmp_path / "data"
    return Store(data_dir, "test", make_store(data_dir))


CAPTCHA_1 = (
    "CAPTCHA/bot challenge (google.com/recaptcha) at https://www.liveinsurer.example/, stopping the run"
)
CAPTCHA_2 = (
    "CAPTCHA/bot challenge (g-recaptcha) at https://www.gstatic.com/recaptcha/, stopping the run"
)
FRONTIER_MIX = {
    "pending": 549,
    "done": 2,
    "skipped_unsafe": 30,
    "unreachable": 10,
    "robots_disallowed": 6,
    "denylisted": 3,
}
DECISION_MIX = [
    ("skip", "ceiling:read", 30, "classified mutating, above the effective ceiling read"),
    ("refuse", "click_failed", 10, "element detached before click"),
    ("skip", "robots:Disallow: *cHash*", 6, "robots.txt disallows this URL"),
    ("merge", "fingerprint:identical-fingerprint", 4, "same fingerprint as an existing state"),
    ("skip", "path:/quote/*", 3, "denylisted path"),
    ("split", "fingerprint:new-cluster", 1, "split into a new cluster"),
]
BIG_RUN = "run-009"


def seed_liveinsurer_like(conn: sqlite3.Connection) -> None:
    """The shape of the 2026-09-25 liveinsurer data: 9 runs (7 interrupted, 2 stopped by CAPTCHA),
    one state, 600 actions and 600 frontier items (one per extracted action), all on run-009."""
    for n in range(1, 10):
        run_id = f"run-{n:03d}"
        status, warning = "interrupted", None
        if n == 5:
            status, warning = "stopped_warning", CAPTCHA_1
        if n == 6:
            status, warning = "stopped_warning", CAPTCHA_2
        insert(
            conn,
            "runs",
            id=run_id,
            status=status,
            warning=warning,
            steps_used=3 if n == 9 else 0,
            started_at=ts(n * 5),
            ended_at=ts(n * 5 + 2),
        )
        if warning:
            insert(
                conn,
                "decision_log",
                id=f"dec-{run_id}-warn",
                run_id=run_id,
                kind="warning",
                rule="block_detected",
                reason=warning,
            )
    insert(conn, "states", id="state-home", first_seen_run=BIG_RUN, title="Kup ubezpieczenia")
    insert(conn, "state_observations", run_id=BIG_RUN, state_id="state-home")
    i = 0
    for status, count in FRONTIER_MIX.items():
        for _ in range(count):
            i += 1
            skipped = status == "skipped_unsafe"
            insert(
                conn,
                "actions",
                id=f"act-{i:04d}",
                run_id=BIG_RUN,
                state_id="state-home",
                accessible_name=f"Link {i}",
                safety_class="mutating" if skipped else "read",
                allowed=0 if skipped else 1,
                skip_reason="above ceiling read" if skipped else None,
            )
            insert(
                conn,
                "frontier",
                id=f"fr-{i:04d}",
                run_id=BIG_RUN,
                state_id="state-home",
                action_id=f"act-{i:04d}",
                safety_class="mutating" if skipped else "read",
                status=status,
                reason=None if status in ("pending", "done") else f"{status} reason",
            )
    j = 0
    for kind, rule, count, reason in DECISION_MIX:
        for _ in range(count):
            j += 1
            insert(
                conn,
                "decision_log",
                id=f"dec-{j:04d}",
                run_id=BIG_RUN,
                kind=kind,
                rule=rule,
                reason=reason,
                subject_ref=f"fr-{j:04d}",
            )
    for k in range(6):
        insert(conn, "forms", id=f"form-{k}", run_id=BIG_RUN, state_id="state-home")
    for k in range(9):
        insert(conn, "network_calls", id=f"net-{k}", run_id=BIG_RUN)
    for k in range(10):
        insert(
            conn,
            "robots_policies",
            id=f"rob-{k:02d}",
            run_id=f"run-{(k % 9) + 1:03d}",
            fetched_at=ts(k),
        )
    insert(conn, "edges", id="edge-1", run_id=BIG_RUN, from_state="state-home")
    insert(conn, "edges", id="edge-2", run_id=BIG_RUN, from_state="state-home")


@pytest.fixture
def liveinsurer_store(empty_store: Store) -> Store:
    conn = empty_store.connect()
    seed_liveinsurer_like(conn)
    conn.commit()
    conn.close()
    return empty_store


def make_client(store: Store, **overrides: object) -> TestClient:
    settings = Settings(data_dir=store.data_dir, default_env=store.env, **overrides)
    return TestClient(create_app(settings))


@pytest.fixture
def client(liveinsurer_store: Store) -> Iterator[TestClient]:
    with make_client(liveinsurer_store) as c:
        yield c


@pytest.fixture
def empty_client(empty_store: Store) -> Iterator[TestClient]:
    with make_client(empty_store) as c:
        yield c
