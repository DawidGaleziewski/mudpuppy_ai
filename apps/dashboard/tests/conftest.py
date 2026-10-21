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

from .paths import REPO_ROOT

MIGRATIONS = sorted((REPO_ROOT / "data" / "migrations").glob("*.up.sql"))

T0 = "2026-09-25T19:00:00.000Z"
EVIDENCE = "a" * 64 + ".json"


@pytest.fixture(autouse=True)
def _no_machine_eval_workspaces(
    monkeypatch: pytest.MonkeyPatch, tmp_path_factory: pytest.TempPathFactory
) -> None:
    """The store picker lists eval workspaces under the system temp dir (spec 019); tests see an
    empty one unless they build their own, so real `pnpm eval` leftovers never leak in."""
    monkeypatch.setenv("PATHFINDER_EVAL_ROOT", str(tmp_path_factory.mktemp("no-evals")))


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
    "transitions": {
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
        "transition_id": None,
        "method": "GET",
        "url_template": "/api/:param",
        "status": 200,
        "req_schema": "{}",
        "res_schema": json.dumps({"type": "object"}),
        "console_errors": "[]",
        "created_at": T0,
    },
    "open_questions": {"status": "open", "created_at": T0},
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
    "trace_boots": {
        "started_at": T0,
        "ended_at": None,
        "environment": "production",
        "server": "pathfinder",
        "pid": 1,
        "version": "0.0.0",
        "trace_level": "standard",
        "pw_trace": "non_production",
    },
    "trace_spans": {
        "seq": 1,
        "run_id": None,
        "parent_id": None,
        "kind": "call",
        "status": "ok",
        "started_at": T0,
        "ended_at": T0,
        "duration_ms": 10,
        "attrs_json": "{}",
        "payload_ref": None,
        "summary": "",
        "decision_id": None,
        "tool_use_id": None,
        "agent_id": None,
        "rationale": None,
        "pw_trace_path": None,
        "between_calls": 0,
    },
    "agent_turns": {
        "agent_id": "agent-1",
        "agent_type": "crawler",
        "session_id": None,
        "block_index": 0,
        "api_message_id": None,
        "run_id": None,
        "role": "assistant",
        "kind": "text",
        "tool_use_id": None,
        "tool_name": None,
        "text": None,
        "payload_ref": None,
        "is_error": None,
        "model": None,
        "input_tokens": None,
        "output_tokens": None,
        "cache_read_tokens": None,
        "cache_creation_tokens": None,
        "matched": 0,
        "created_at": T0,
        "imported_at": T0,
    },
}


#: 0040 (spec 039 § 15): the `entity_refs` column each kind the BA cites lands in.
EVIDENCE_COLUMN = {
    "state": "state_id",
    "screen_region": "state_id",
    "transition": "transition_id",
    "action": "action_id",
    "form": "form_id",
    "network_call": "network_call_id",
    "open_question": "open_question_id",
    "decision": "decision_id",
    "process": "trace_process_id",
    "process_step": "trace_step_id",
    "doc_record": "doc_record_id",
    "review": "review_id",
    "observation": "observation_id",
}


def add_ref(
    conn: sqlite3.Connection, ref_id: str, kind: str, target: str, region: str | None = None
) -> str:
    """One `entity_refs` row for what a link or question cites."""
    conn.execute(
        f"INSERT INTO entity_refs (id, {EVIDENCE_COLUMN[kind]}, element_key) VALUES (?, ?, ?)",
        (ref_id, target, region if kind == "screen_region" else None),
    )
    return ref_id


def add_evidence_link(
    conn: sqlite3.Connection,
    link_id: str,
    revision_id: str,
    kind: str,
    target: str,
    run_id: str | None,
    note: str | None = None,
    region: str | None = None,
) -> None:
    """An evidence link as the BA states it: its ref, then the link."""
    add_ref(conn, f"ref-{link_id}", kind, target, region)
    conn.execute(
        "INSERT INTO doc_evidence_links (id, revision_id, ref_id, run_id, note)"
        " VALUES (?, ?, ?, ?, ?)",
        (link_id, revision_id, f"ref-{link_id}", run_id, note),
    )


def insert(conn: sqlite3.Connection, table: str, **row: object) -> None:
    """Insert one row, filling the table's defaults for columns not given. An open question names
    its subject state with `about_ref` (any state of the store when not given) and gets its ref;
    an evidence link given as the BA states it (`target_kind`, `target_id`, `region`) too."""
    if table == "doc_evidence_links" and "ref_id" not in row:
        link = {**DEFAULTS.get(table, {}), **row}
        add_evidence_link(
            conn,
            str(link["id"]),
            str(link["revision_id"]),
            str(link.get("target_kind", "state")),
            str(link["target_id"]),
            link.get("run_id"),  # type: ignore[arg-type]
            link.get("note"),  # type: ignore[arg-type]
            link.get("region"),  # type: ignore[arg-type]
        )
        return
    # 0041: amendments and their revisions cite their target through a ref, a chat proposal names
    # its amendment, a mark its target in a typed column; fixtures still state kind and id.
    if table in ("amendments", "amendment_revisions") and "target_kind" in row:
        kind, target = str(row.pop("target_kind")), str(row.pop("target_id"))
        ref = f"ref-{table}-{row.get('id') or row['amendment_id']}-{row.get('rev', 1)}"
        state, _, key = target.partition("#")
        conn.execute(
            "INSERT INTO entity_refs (id, state_id, element_key, evidence_file)"
            " VALUES (?, ?, ?, ?)",
            (
                ref,
                None if kind == "evidence" else state,
                key if kind == "wireframe_element" else None,
                target if kind == "evidence" else None,
            ),
        )
        row["ref_id"] = ref
    if table == "chat_proposals" and "target_kind" in row:
        row.pop("target_kind")
        row["amendment_id"] = row.pop("target_id", None)
    if table == "marks" and "target_kind" in row:
        column = {"form_step": "form_step_id", "state": "state_id", "transition": "transition_id"}
        row[column[str(row.pop("target_kind"))]] = row.pop("target_id")
    if table == "open_questions" and "ref_id" not in row:
        about = row.pop("about_ref", None) or conn.execute("SELECT id FROM states").fetchone()[0]
        row["ref_id"] = add_ref(conn, f"ref-{row['id']}", "state", str(about))
    full = {**DEFAULTS.get(table, {}), **row}
    cols = ", ".join(full)
    marks = ", ".join("?" for _ in full)
    conn.execute(f"INSERT INTO {table} ({cols}) VALUES ({marks})", tuple(full.values()))


TRACE_SPAN_COLUMNS = (
    "id",
    "boot_id",
    "seq",
    "run_id",
    "parent_id",
    "kind",
    "name",
    "status",
    "started_at",
    "ended_at",
    "duration_ms",
    "attrs_json",
    "payload_ref",
    "summary",
    "decision_id",
    "tool_use_id",
    "agent_id",
    "rationale",
    "pw_trace_path",
    "between_calls",
)


def make_trace_fixture(
    conn: sqlite3.Connection, run_id: str, calls: int = 500, spans_per_call: int = 40
) -> None:
    """~`calls * spans_per_call` trace_spans (default 500 * 40 = 20 000) on one run, bulk-inserted
    for speed: SC-005's perf shape (T042)."""
    insert(conn, "trace_boots", id="perf-boot", started_at=T0)
    tools = ("navigate", "act", "extract", "finish_run")
    phase_names = ("gate", "goto", "settle", "observe", "fingerprint")
    rows: list[tuple[object, ...]] = []
    seq = 0

    def row(
        id_: str,
        parent_id: str | None,
        kind: str,
        name: str,
        duration_ms: int | None,
        tool_use_id: str | None = None,
    ) -> tuple[object, ...]:
        return (
            id_,
            "perf-boot",
            seq,
            run_id,
            parent_id,
            kind,
            name,
            "ok",
            T0,
            T0 if duration_ms is not None else None,
            duration_ms,
            "{}",
            None,
            name,
            None,
            tool_use_id,
            None,
            None,
            None,
            0,
        )

    for i in range(calls):
        seq += 1
        call_id = f"perf-call-{i:05d}"
        rows.append(row(call_id, None, "call", tools[i % len(tools)], 100, f"perf-tu-{i:05d}"))
        for j in range(spans_per_call - 1):
            seq += 1
            is_phase = j % 2 == 0
            rows.append(
                row(
                    f"{call_id}-c{j:02d}",
                    call_id,
                    "phase" if is_phase else "event",
                    phase_names[j % len(phase_names)] if is_phase else "request",
                    2 if is_phase else None,
                )
            )
    conn.executemany(
        f"INSERT INTO trace_spans ({', '.join(TRACE_SPAN_COLUMNS)})"
        f" VALUES ({', '.join('?' for _ in TRACE_SPAN_COLUMNS)})",
        rows,
    )


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
    insert(conn, "transitions", id="edge-1", run_id=BIG_RUN, from_state="state-home")
    insert(conn, "transitions", id="edge-2", run_id=BIG_RUN, from_state="state-home")


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


# --- Layer B (BA documentation) and process rows: test-only seed helpers (spec 004, T051) -------

PORTAL = "reference-insurer"
KIND_BY_PREFIX = {
    "CAP": "capability",
    "SCR": "screen",
    "PROC": "process",
    "UC": "use_case",
    "REQ": "requirement",
    "NFR": "nfr",
    "BR": "business_rule",
    "GL": "glossary_term",
    "DI": "data_item",
    "ASM": "assumption",
    "OQ": "open_question",
    "FUP": "followup",
}


def add_session(
    conn: sqlite3.Connection,
    id: str,
    runs: tuple[str, ...] = (),
    portal: str = PORTAL,
    status: str = "completed",
    started: int = 30,
    gaps: tuple[str, ...] = (),
    passes: tuple[str, ...] = ("inventory", "synthesis"),
) -> None:
    conn.execute(
        "INSERT INTO analysis_sessions (id, portal_id, status, passes_json, summary, gaps_json,"
        " started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            id,
            portal,
            status,
            json.dumps(
                [{"pass": p, "summary": f"{p} done", "completed_at": ts(started)} for p in passes]
            ),
            f"summary of {id}" if status == "completed" else None,
            json.dumps(list(gaps)),
            ts(started),
            ts(started + 5) if status != "running" else None,
        ),
    )
    for run_id in runs:
        conn.execute("INSERT INTO analysis_session_runs VALUES (?, ?)", (id, run_id))


def add_record(
    conn: sqlite3.Connection,
    key: str,
    title: str,
    revisions: list[dict[str, object]],
    portal: str = PORTAL,
    content: dict[str, object] | None = None,
) -> str:
    """Insert a record and its revisions; `revisions` items take `session`, `status`,
    `confidence`, `change`, `change_note`, `not_observable`, `content` and `evidence`
    (`(target_kind, target_id, run_id, note)` tuples). Returns the record id."""
    prefix, _, seq = key.partition("-")
    kind = KIND_BY_PREFIX[prefix]
    record_id = f"rec-{key}"
    latest = revisions[-1]
    confirmed = [n for n, r in enumerate(revisions, start=1) if r.get("status") == "confirmed"]
    # A PROC record documents its own process (spec 039 T070); PRC-8nn keeps clear of the
    # processes other fixtures create.
    process_id = f"prc-{key}" if kind == "process" else None
    if process_id:
        conn.execute(
            "INSERT INTO ba_processes (id, portal_id, key, name, persona, stage, rev, source,"
            " created_at, updated_at, record_key) VALUES (?, ?, ?, ?, 'guest', 'scoped', 1, 'new',"
            " ?, ?, ?)",
            (process_id, portal, f"PRC-{800 + int(seq)}", title, T0, T0, key),
        )
    conn.execute(
        "INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev,"
        " withdrawn, created_at, updated_at, process_id)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            record_id,
            portal,
            kind,
            key,
            int(seq),
            title,
            len(revisions),
            confirmed[-1] if confirmed else None,
            1 if latest.get("change") == "withdraw" else 0,
            T0,
            ts(40),
            process_id,
        ),
    )
    for n, rev in enumerate(revisions, start=1):
        body = {"kind": kind, "title": title, **(content or {}), **(rev.get("content") or {})}  # type: ignore[arg-type]
        change = str(rev.get("change") or ("create" if n == 1 else "revise"))
        rev_id = f"{key}-r{n}"
        conn.execute(
            "INSERT INTO doc_revisions (id, record_id, rev_no, session_id, change, content_json,"
            " confidence, not_observable, status, change_note, responds_to_review, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)",
            (
                rev_id,
                record_id,
                n,
                rev.get("session", "sess-1"),
                change,
                json.dumps(body),
                rev.get("confidence", "observed"),
                1 if rev.get("not_observable") else 0,
                rev.get("status", "draft"),
                rev.get("change_note") or (None if change == "create" else "revised"),
                ts(30 + n),
            ),
        )
        for i, (tk, target, run, note) in enumerate(rev.get("evidence", [])):  # type: ignore[attr-defined]
            add_evidence_link(conn, f"ev-{key}-{n}-{i}", rev_id, tk, target, run, note)
    return record_id


def add_relation(
    conn: sqlite3.Connection, from_key: str, to_key: str, type_: str, rev_no: int | None = None
) -> None:
    """`from_key`'s revision `rev_no` (default latest) asserts `type_` towards `to_key`."""
    if rev_no is None:
        rev_no = conn.execute(
            "SELECT latest_rev FROM doc_records WHERE key = ?", (from_key,)
        ).fetchone()[0]
    conn.execute(
        "INSERT INTO doc_relations VALUES (?, ?, ?)",
        (f"{from_key}-r{rev_no}", f"rec-{to_key}", type_),
    )


def add_review(
    conn: sqlite3.Connection, key: str, rev_no: int, action: str, text: str | None = None
) -> None:
    conn.execute(
        "INSERT INTO doc_reviews (id, revision_id, action, reviewer, text, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (f"rv-{key}-{rev_no}-{action}", f"{key}-r{rev_no}", action, "Test Reviewer", text, ts(50)),
    )


def seed_process(conn: sqlite3.Connection, run_id: str, boundary_action: str) -> None:
    """A trace run's process (boundary reached on a mutating action) with three steps."""
    conn.execute(
        "INSERT INTO processes (id, run_id, portal_id, persona_id, name, goal, followup_record_id,"
        " status, outcome, boundary_action_id, observed_result, not_observable, created_at,"
        " ended_at)"
        " VALUES ('proc-1', ?, ?, 'guest', 'Buy a car policy', 'Reach the purchase confirmation',"
        " NULL, 'recorded', 'boundary_reached', ?, 'Premium shown: 1 234 PLN',"
        " 'What happens after Kup polisę is not observable: mutating on production', ?, ?)",
        (run_id, PORTAL, boundary_action, ts(20), ts(25)),
    )
    steps = [
        (1, "Open the calculator", "navigate", None, None),
        (2, "Enter the car model", "fill", "act-model", "Octavia"),
        (3, "Calculate the premium", "click", "act-calc", None),
    ]
    for ord_, intent, kind, action, value in steps:
        conn.execute(
            "INSERT INTO process_steps (id, process_id, ord, intent, kind, action_id,"
            " transition_id, value, state_before, state_after, outcomes_json, evidence_ref,"
            " confidence, created_at)"
            " VALUES (?, 'proc-1', ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, ?, 'observed', ?)",
            (
                f"step-{ord_}",
                ord_,
                intent,
                kind,
                action,
                value,
                json.dumps([f"outcome {ord_}"]),
                EVIDENCE,
                ts(20, ord_),
            ),
        )


def seed_ba(conn: sqlite3.Connection) -> None:
    """Portal `reference-insurer`: a map run and a trace run, two sessions, and records of every
    kind covering every state of the Docs tab (see tasks.md T051)."""
    for run_id, mode, minute in (("run-map", "map", 10), ("run-trace", "trace", 20)):
        insert(
            conn,
            "runs",
            id=run_id,
            portal_id=PORTAL,
            mode=mode,
            status="completed",
            started_at=ts(minute),
            ended_at=ts(minute + 5),
            persona_id="guest",
        )
    for sid, title, route in (
        ("st-home", "Home", "/"),
        ("st-calc", "Kalkulator OC/AC", "/kalkulator/pojazd"),
    ):
        insert(
            conn,
            "states",
            id=sid,
            portal_id=PORTAL,
            first_seen_run="run-map",
            title=title,
            route_template=route,
            fingerprint=f"fp-{sid}",
            cluster_id=f"cl-{sid}",
        )
        insert(conn, "state_observations", run_id="run-map", state_id=sid)
    insert(
        conn,
        "actions",
        id="act-calc",
        run_id="run-map",
        state_id="st-calc",
        role="button",
        accessible_name="Oblicz składkę",
    )
    insert(
        conn,
        "actions",
        id="act-model",
        run_id="run-map",
        state_id="st-calc",
        role="textbox",
        accessible_name="Model",
    )
    insert(
        conn,
        "actions",
        id="act-buy",
        run_id="run-trace",
        state_id="st-calc",
        role="button",
        accessible_name="Kup polisę",
        safety_class="mutating",
        allowed=0,
        skip_reason="mutating",
    )
    insert(
        conn,
        "transitions",
        id="edge-1",
        run_id="run-map",
        from_state="st-home",
        to_state="st-calc",
        action_json=json.dumps({"accessible_name": "Oblicz składkę"}),
    )
    insert(conn, "forms", id="form-vehicle", run_id="run-map", state_id="st-calc")
    insert(conn, "network_calls", id="net-quote", run_id="run-map")
    insert(
        conn,
        "decision_log",
        id="dec-1",
        run_id="run-map",
        kind="skip",
        rule="ceiling:read",
        reason="mutating above ceiling",
    )
    insert(
        conn,
        "open_questions",
        id="oq-1",
        run_id="run-map",
        about_ref="st-calc",
        text="Why is Model required?",
    )
    seed_process(conn, "run-trace", "act-buy")

    add_session(conn, "sess-1", runs=("run-map",), started=30, gaps=("Login pages not observable",))
    add_session(
        conn,
        "sess-2",
        runs=("run-map", "run-trace"),
        started=60,
        passes=("processes", "rules", "synthesis"),
    )

    obs = ("state", "st-calc", "run-map", "Page title Kalkulator")
    add_record(
        conn,
        "CAP-001",
        "Premium calculation",
        [
            {"status": "confirmed", "evidence": [obs]},
        ],
        content={"description": "Guests can calculate a car premium."},
    )
    add_record(
        conn,
        "SCR-001",
        "Home page",
        [{"evidence": [("state", "st-home", "run-map", None)]}],
        content={
            "purpose": "Landing page",
            "route_templates": ["/"],
            "elements": [{"role": "link", "label_verbatim": "Oblicz składkę"}],
            "entry_points": [],
        },
    )
    add_record(
        conn,
        "SCR-002",
        "Calculator, vehicle step",
        [{"evidence": [obs, ("transition", "edge-1", "run-map", None)]}],
        content={
            "purpose": "Vehicle data",
            "route_templates": ["/kalkulator/pojazd"],
            "elements": [],
            "entry_points": ["SCR-001"],
        },
    )
    add_record(
        conn,
        "REQ-001",
        "Premium form requires the model",
        [
            {"status": "confirmed", "session": "sess-1", "evidence": [obs]},
            {
                "status": "draft",
                "session": "sess-2",
                "confidence": "inferred",
                "change_note": "Added the form field evidence",
                "evidence": [
                    ("form", "form-vehicle", "run-map", "field Model marked required"),
                    ("action", "act-calc", "run-map", None),
                    ("network_call", "net-quote", "run-map", None),
                    ("decision", "dec-1", "run-map", None),
                    ("open_question", "oq-1", "run-map", None),
                    ("process_step", "step-2", "run-trace", "step 2 enters the model"),
                    ("doc_record", "rec-SCR-002", None, "see the screen"),
                ],
            },
        ],
        content={
            "statement": 'The system shall require the field "Model".',
            "rationale": "Form validation",
            "rationale_confidence": "inferred",
            "priority": "must",
            "acceptance_criteria": [
                {
                    "given": ["the calculator is open"],
                    "when": ["Model is empty"],
                    "then": ["the form reports an error"],
                }
            ],
        },
    )
    add_review(conn, "REQ-001", 1, "confirm")
    add_record(
        conn,
        "BR-001",
        "Postal code format",
        [{"status": "rejected", "evidence": [("form", "form-vehicle", "run-map", None)]}],
        content={
            "statement": "Postal code is NN-NNN",
            "rule_type": "constraint",
            "decision_table": {
                "conditions": ["format"],
                "actions": ["accept"],
                "rows": [["NN-NNN", "yes"], ["other", "no"]],
            },
        },
    )
    add_review(conn, "BR-001", 1, "reject", "Not evidenced: only a hint was seen")
    add_record(
        conn,
        "GL-001",
        "Premium",
        [
            {"status": "confirmed", "evidence": [obs]},
            {"change": "withdraw", "change_note": "term not used", "evidence": [obs]},
        ],
        content={
            "term_verbatim": "Składka",
            "lang": "pl",
            "definition": "Price of a policy",
            "synonyms_verbatim": [],
        },
    )
    add_record(
        conn,
        "PROC-001",
        "Buy a car policy",
        [
            {
                "confidence": "inferred",
                "not_observable": True,
                "session": "sess-2",
                "evidence": [
                    ("process", "proc-1", "run-trace", "trace run"),
                    ("process_step", "step-3", "run-trace", None),
                ],
            }
        ],
        content={
            "goal": "Buy a policy",
            "persona": "guest",
            "trigger": "Oblicz składkę",
            "outcome": "Stopped at Kup polisę",
            "observed_extent": "until_boundary",
        },
    )
    add_record(
        conn,
        "PROC-002",
        "Renew a policy",
        [{"confidence": "needs_confirmation", "evidence": [obs]}],
        content={
            "goal": "Renew",
            "persona": "customer",
            "trigger": "Przedłuż",
            "outcome": "unknown",
            "observed_extent": "map_only",
        },
    )
    add_record(
        conn,
        "UC-001",
        "Calculate a premium",
        [{"evidence": [obs]}],
        content={
            "primary_actor": "guest",
            "preconditions": ["none"],
            "trigger": "open calculator",
            "main_flow": [
                {"n": 1, "actor_or_system": "guest", "text": "Enter the model"},
                {"n": 2, "actor_or_system": "system", "text": "Shows the premium"},
            ],
            "alternate_flows": [
                [{"n": 1, "actor_or_system": "guest", "text": "Picks another model"}]
            ],
            "exception_flows": [],
            "postconditions": ["premium shown"],
        },
    )
    add_record(
        conn,
        "NFR-001",
        "Content in Polish",
        [{"evidence": [obs]}],
        content={
            "category": "localisation",
            "statement": "All content is Polish",
            "measured": {"value": "2 of 2", "unit": "pages", "how": "read snapshots"},
        },
    )
    add_record(
        conn,
        "DI-001",
        "Kod pocztowy",
        [{"evidence": [("form", "form-vehicle", "run-map", None)]}],
        content={
            "name_verbatim": "Kod pocztowy",
            "lang": "pl",
            "name_en": "Postal code",
            "data_type": "string",
            "constraints": {"required": True, "format": "NN-NNN"},
            "seen_in": [{"kind": "form", "target_id": "form-vehicle"}],
        },
    )
    add_record(
        conn,
        "ASM-001",
        "Logged-in users renew online",
        [{"confidence": "needs_confirmation", "not_observable": True, "evidence": [obs]}],
        content={
            "statement": "Customers can renew online",
            "impact_if_wrong": "CAP-002 mis-scoped",
        },
    )
    add_record(
        conn,
        "OQ-001",
        "Account pages",
        [
            {
                "confidence": "needs_confirmation",
                "evidence": [("open_question", "oq-1", "run-map", None)],
            }
        ],
        content={
            "question": "What is behind the login?",
            "why_it_matters": "Rules are missing",
            "answer_needed_from": "sme",
        },
    )
    add_record(
        conn,
        "FUP-001",
        "Trace the calculator",
        [{"confidence": "needs_confirmation", "evidence": [obs]}],
        content={
            "question": "What are steps 2-4?",
            "suggested_mode": "trace",
            "target": {"process_name": "Calc", "goal": "Reach the premium"},
            "persona": "guest",
            "reason": "Only step 1 observed",
        },
    )
    conn.execute(
        "INSERT INTO followup_tasks"
        " VALUES ('rec-FUP-001', 'blocked', NULL, 'mutating on production', ?)",
        (ts(45),),
    )
    add_relation(conn, "CAP-001", "SCR-002", "contains")
    add_relation(conn, "CAP-001", "PROC-001", "contains")
    add_relation(conn, "REQ-001", "CAP-001", "refines")
    # Only triples the store allows (0013_relation_triples).
    add_relation(conn, "REQ-001", "BR-001", "enforces")
    add_relation(conn, "ASM-001", "OQ-001", "answers")


@pytest.fixture
def ba_fixture(empty_store: Store) -> Store:
    """`reference-insurer` with Layer B records of every kind; see `seed_ba`."""
    conn = empty_store.connect()
    seed_ba(conn)
    conn.commit()
    conn.close()
    return empty_store


@pytest.fixture
def ba_client(ba_fixture: Store) -> Iterator[TestClient]:
    with make_client(ba_fixture) as c:
        yield c
