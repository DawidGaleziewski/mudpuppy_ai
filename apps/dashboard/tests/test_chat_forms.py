"""R-30 chat read models and credentials (T020, T031, T033), and the seeds of mapped states and
amendments other tests share. The chat service is mocked at the transport; the store is a fixture
built from the real migrations, opened read-only by the app."""

from __future__ import annotations

import json
from pathlib import Path

import httpx2
import pytest
from fastapi.testclient import TestClient

from mudpuppy_dashboard import db, queries_chat
from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import T0, Store, insert, ts
from .test_chat import CONV, ORIGIN, Service, seed_conversation
from .test_visuals import LAYOUT, SHOT, write_evidence

FAKE_SECRET = "fake-password-not-real"
RUN = "run-1"


def make_client(store: Store, service: Service, personas: Path | None = None) -> TestClient:
    extra = {"personas_dir": personas} if personas else {}
    settings = Settings(data_dir=store.data_dir, default_env=store.env, **extra)
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(service)))


@pytest.fixture
def personas(tmp_path: Path) -> Path:
    root = tmp_path / "personas"
    (root / "_mixins").mkdir(parents=True)
    (root / "_mixins" / "base.yaml").write_text("auth:\n  token: ref:SHARED_TOKEN\n")
    (root / "liveinsurer").mkdir()
    (root / "liveinsurer" / "client.yaml").write_text(
        "id: client\nextends: ['../_mixins/base.yaml', '../../outside.yaml']\n"
        "auth:\n  login: ref:LIVEINSURER_LOGIN\n  password: ref:LIVEINSURER_PASSWORD\n  other: ref:lower\n"
    )
    (root / "liveinsurer" / "guest.yaml").write_text("id: guest\nauth: none\n")
    return root


def seed_run(store: Store) -> None:
    conn = store.connect()
    insert(conn, "runs", id=RUN, status="completed", started_at=T0, ended_at=ts(1))
    conn.commit()
    conn.close()


def seed_state(store: Store, sid: str, title: str, route: str, **extra: object) -> None:
    conn = store.connect()
    insert(
        conn,
        "states",
        id=sid,
        fingerprint=f"fp-{sid}",
        title=title,
        route_template=route,
        first_seen_run=RUN,
        **extra,
    )
    conn.commit()
    conn.close()


def seed_amendment(store: Store, n: int, **over: object) -> None:
    row: dict[str, object] = {
        "id": f"amd-id-{n}",
        "key": f"AMD-{n:03d}",
        "portal_id": "liveinsurer",
        "scope_id": None,
        "target_kind": "state",
        "target_id": "st-1",
        "kind": "note",
        "text": f"note {n}",
        "attachment_sha256": None,
        "attachment_name": None,
        "author": "BA",
        "status": "active",
        "anchor_fingerprint": "fp",
        "anchor_route_template": "/",
        "anchor_element": None,
        "superseded_by_run": None,
        "superseded_reason": None,
        "superseded_detail": None,
        "superseded_at": None,
        "dismissed_at": None,
        "reapplied_as": None,
        "reapplies": None,
        "created_at": ts(n),
        "withdrawn_at": None,
        **over,
    }
    conn = store.connect()
    insert(conn, "amendments", **row)
    conn.commit()
    conn.close()


def seed_superseded(store: Store, n: int, **over: object) -> None:
    """An amendment a scan flagged for re-anchoring (`needs_reanchor` replaced `superseded`,
    spec 022); the superseded_* columns keep why."""
    row: dict[str, object] = {
        "status": "needs_reanchor",
        "superseded_by_run": RUN,
        "superseded_reason": "element_changed",
        "superseded_detail": "button renamed",
        "superseded_at": ts(10 + n),
        **over,
    }
    seed_amendment(store, n, **row)


@pytest.fixture
def mapped(empty_store: Store) -> Store:
    """A conversation about liveinsurer, one run, and two states (one with a screenshot and layout)."""
    write_evidence(empty_store.data_dir)
    seed_conversation(empty_store)
    seed_run(empty_store)
    seed_state(
        empty_store,
        "st-1",
        "Kalkulator <b>OC</b>",
        "/kalkulator",
        screenshot_ref=SHOT,
        layout_ref=LAYOUT,
    )
    seed_state(empty_store, "st-2", "Kontakt", "/kontakt")
    return empty_store


# --- queries ------------------------------------------------------------------------------------


def test_list_personas_reads_refs_from_file_and_mixins_only_inside_personas(personas: Path) -> None:
    found = {p.id: p.refs for p in queries_chat.list_personas(personas, "liveinsurer")}
    assert found == {"client": ["LIVEINSURER_LOGIN", "LIVEINSURER_PASSWORD", "SHARED_TOKEN"], "guest": []}
    assert queries_chat.list_personas(personas, "nope") == []
    assert queries_chat.list_personas(personas, "../liveinsurer") == []
    assert queries_chat.list_personas(personas, None) == []


def test_amendments_for_state_covers_state_and_its_elements_only(mapped: Store) -> None:
    seed_amendment(mapped, 1)
    seed_amendment(
        mapped,
        2,
        target_kind="wireframe_element",
        target_id='st-1#button "A#B"',
        kind="element_ref",
    )
    seed_state(mapped, "st-10", "Kontakt 10", "/kontakt-10")  # another state, same id prefix
    seed_amendment(mapped, 3, target_id="st-10")
    seed_amendment(
        mapped, 4, target_kind="wireframe_element", target_id="st-10#x", kind="element_ref"
    )
    conn = db.connect(mapped.data_dir, mapped.env)
    keys = [a.key for a in queries_chat.amendments_for_state(conn, "liveinsurer", "st-1")]
    assert keys == ["AMD-001", "AMD-002"]


def test_superseded_counts_skip_reapplied_dismissed_and_other_statuses(mapped: Store) -> None:
    seed_amendment(mapped, 9)
    seed_superseded(mapped, 1)
    seed_superseded(mapped, 2, reapplied_as="amd-id-9")
    seed_amendment(mapped, 3, status="dismissed", dismissed_at=ts(30))
    seed_amendment(mapped, 4)
    conn = db.connect(mapped.data_dir, mapped.env)
    assert queries_chat.superseded_counts(conn) == {"liveinsurer": 1}
    both = queries_chat.superseded_amendments(conn, None, "both")
    assert {a.key for a in both} == {"AMD-001", "AMD-002", "AMD-003"}  # not AMD-004, AMD-009
    assert [a.key for a in queries_chat.superseded_amendments(conn, "liveinsurer", "dismissed")] == [
        "AMD-003"
    ]
    assert queries_chat.superseded_amendments(conn, "other", "both") == []


def test_chat_tables_missing_in_an_old_store_give_nothing(tmp_path: Path) -> None:
    import sqlite3

    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    assert queries_chat.superseded_counts(conn) == {}
    assert queries_chat.amendments_for_state(conn, "p", "s") == []
    assert queries_chat.amendment_portals(conn) == []


# --- credentials through the relay (T020) -------------------------------------------------------


def test_credentials_post_forwards_values_and_never_echoes_them(mapped: Store) -> None:
    service = Service()
    service.routes[("POST", f"/conversations/{CONV}/credentials")] = httpx2.Response(
        200, json={"stored": True, "refs": ["LIVEINSURER_LOGIN"], "echo": FAKE_SECRET}
    )
    body = {
        "portal": "liveinsurer",
        "environment": "staging",
        "values": {"LIVEINSURER_LOGIN": FAKE_SECRET, "EMPTY": ""},
    }
    with make_client(mapped, service) as c:
        r = c.post(f"/chat/conversations/{CONV}/credentials", json=body, headers=ORIGIN)
    assert r.status_code == 200 and r.json() == {"stored": True, "refs": ["LIVEINSURER_LOGIN"]}
    assert FAKE_SECRET not in r.text
    sent = json.loads(service.requests[-1].content)
    assert sent == {
        "portal": "liveinsurer",
        "environment": "staging",
        "values": {"LIVEINSURER_LOGIN": FAKE_SECRET},
    }


def test_credentials_vault_key_missing_409_is_passed_through(mapped: Store) -> None:
    service = Service()
    service.routes[("POST", f"/conversations/{CONV}/credentials")] = httpx2.Response(
        409, json={"ref": "ERR-1-a", "message": "No vault key is configured."}
    )
    with make_client(mapped, service) as c:
        r = c.post(
            f"/chat/conversations/{CONV}/credentials",
            json={"portal": "liveinsurer", "environment": "sandbox", "values": {"A_B": FAKE_SECRET}},
            headers=ORIGIN,
        )
    assert r.status_code == 409
    assert r.json() == {"ref": "ERR-1-a", "message": "No vault key is configured."}
    assert FAKE_SECRET not in r.text


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"environment": "sandbox", "values": {"A": "x"}}, "Choose a portal"),
        ({"portal": "liveinsurer", "environment": "prod", "values": {"A": "x"}}, "sandbox, staging"),
        ({"portal": "liveinsurer", "environment": "sandbox", "values": {"A": ""}}, "at least one value"),
        (
            {"portal": "liveinsurer", "environment": "sandbox", "values": {"bad name": "x"}},
            "capital letters",
        ),
    ],
)
def test_credentials_invalid_input_is_422_and_not_forwarded(
    mapped: Store, payload: dict[str, object], message: str
) -> None:
    service = Service()
    with make_client(mapped, service) as c:
        r = c.post(f"/chat/conversations/{CONV}/credentials", json=payload, headers=ORIGIN)
    assert r.status_code == 422 and message in r.json()["message"]
    assert not [q for q in service.requests if q.url.path.endswith("/credentials")]


def test_credentials_cross_origin_and_service_down(mapped: Store) -> None:
    ok = {"portal": "liveinsurer", "environment": "sandbox", "values": {"A": FAKE_SECRET}}
    with make_client(mapped, Service()) as c:
        assert c.post(f"/chat/conversations/{CONV}/credentials", json=ok).status_code == 403
        bad = {"Origin": "http://evil.example"}
        assert (
            c.post(f"/chat/conversations/{CONV}/credentials", json=ok, headers=bad).status_code
            == 403
        )
    with make_client(mapped, Service(up=False)) as c:
        r = c.post(f"/chat/conversations/{CONV}/credentials", json=ok, headers=ORIGIN)
    assert r.status_code == 503 and "not running" in r.json()["message"]
    assert "MUDPUPPY_ENV=" in r.json()["message"]  # the start command names an environment
    assert FAKE_SECRET not in r.text
