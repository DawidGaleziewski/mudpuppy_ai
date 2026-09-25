"""FR-015: read models mirror the tables built from data/migrations.

A schema drift fails here, not silently in the UI.
"""

import re
import sqlite3
import typing

import pytest

from pathfinder_dashboard.models import TABLE_MODELS

from .conftest import Store


def table_sql(conn: sqlite3.Connection, table: str) -> str:
    return conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
    ).fetchone()[0]


def allowed_values(sql: str, column: str) -> set[str] | None:
    """Values a column's CHECK allows: `col IN ('a','b')` or `col = 'a'`, None if unconstrained."""
    m = re.search(rf"CHECK\s*\(\s*{column}\s+IN\s*\(([^)]*)\)\s*\)", sql)
    if m:
        return set(re.findall(r"'([^']*)'", m.group(1)))
    m = re.search(rf"CHECK\s*\(\s*{column}\s*=\s*'([^']*)'\s*\)", sql)
    return {m.group(1)} if m else None


def literal_values(annotation: object) -> set[str] | None:
    for arg in (annotation, *typing.get_args(annotation)):
        if typing.get_origin(arg) is typing.Literal:
            return set(typing.get_args(arg))
    return None


def test_every_table_has_a_model(empty_store: Store) -> None:
    conn = empty_store.connect()
    tables = {
        r[0]
        for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        if r[0] != "schema_migrations"
    }
    assert tables == set(TABLE_MODELS)


@pytest.mark.parametrize("table", sorted(TABLE_MODELS))
def test_model_fields_equal_table_columns(empty_store: Store, table: str) -> None:
    conn = empty_store.connect()
    columns = [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]
    assert list(TABLE_MODELS[table].model_fields) == columns


@pytest.mark.parametrize("table", sorted(TABLE_MODELS))
def test_model_literals_equal_table_checks(empty_store: Store, table: str) -> None:
    conn = empty_store.connect()
    sql = table_sql(conn, table)
    for name, field in TABLE_MODELS[table].model_fields.items():
        checked = allowed_values(sql, name)
        literal = literal_values(field.annotation)
        if checked is None or name in {"allowed", "truncated"}:
            continue  # unconstrained text, or a 0/1 flag mapped to bool
        assert literal == checked, f"{table}.{name}: model {literal} != CHECK {checked}"


def test_known_enums_are_complete() -> None:
    """The enums the UI maps to labels (contracts/ui-conventions.md)."""
    from pathfinder_dashboard import models

    assert set(typing.get_args(models.RunStatus)) == {
        "running",
        "completed",
        "stopped_warning",
        "interrupted",
    }
    assert len(typing.get_args(models.FrontierStatus)) == 8
    assert "robots_disallowed" in typing.get_args(models.FrontierStatus)
    assert set(typing.get_args(models.DecisionKind)) == {
        "skip",
        "refuse",
        "merge",
        "split",
        "warning",
        "note",
    }
    assert set(typing.get_args(models.SafetyClass)) == {
        "read",
        "mutating",
        "destructive",
        "external-side-effect",
    }
    assert set(typing.get_args(models.Confidence)) == {
        "observed",
        "inferred",
        "needs_confirmation",
    }


def test_invalid_json_is_kept_raw() -> None:
    from pathfinder_dashboard.models import DecisionLogEntry

    entry = DecisionLogEntry(
        id="d",
        run_id="r",
        kind="note",
        rule=None,
        reason="x",
        subject_ref=None,
        detail_json="{not json",
        created_at="t",
    )
    assert entry.detail_json == "{not json"
    ok = DecisionLogEntry.model_validate({**entry.model_dump(), "detail_json": '{"a": 1}'})
    assert ok.detail_json == {"a": 1}
