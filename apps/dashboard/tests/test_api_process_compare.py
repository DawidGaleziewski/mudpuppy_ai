"""The React console's Compare and History of a process (R-96, spec 060): the step diff with its
change spec, which model runs where and every revision; the change spec, live marks and restores
go to the chat service signed."""

from __future__ import annotations

import json

import httpx2

from .conftest import Store
from .test_chat import ORIGIN, Service
from .test_processes_pages import P, client, seed

API = f"/api/portals/{P}/processes"


def test_compare_shows_the_diff_with_the_persons_draft_and_the_spec(empty_store: Store) -> None:
    with client(seed(empty_store)) as c:
        body = c.get(f"{API}/PRC-001/compare?left=A&right=B").json()
        missing = c.get(f"{API}/PRC-404/compare")
    assert (body["left_label"], body["right_label"], body["draft"]) == ("A r1", "B r2", True)
    changes = [r["change"]["word"] for r in body["rows"]]
    assert "Merged" in changes and "Added" in changes
    merged = next(r for r in body["rows"] if r["change"]["word"] == "Merged")
    assert [s["title"] for s in merged["left"]] == ["Car", "Driver"]
    assert merged["right"]["title"] == "One form" and merged["merged"] == "2 steps into 1"
    assert body["sections"][0]["key"] == "scope"
    assert body["saved"] is None and body["spec_head"] is None
    assert {o["value"] for o in body["head"]["models"]} == {"A", "B"}
    assert missing.status_code == 404


def test_history_has_where_each_model_runs_and_every_revision(empty_store: Store) -> None:
    with client(seed(empty_store, b_rev=2, draft_base=1)) as c:
        body = c.get(f"{API}/PRC-001/history").json()
    sandbox = next(row for row in body["live"] if row["environment"] == "sandbox")
    assert sandbox["live"] == "A r1" and sandbox["status"]["word"] == "Live"
    staging = next(row for row in body["live"] if row["environment"] == "staging")
    assert staging["live"] is None and staging["how"] is None
    b = next(m for m in body["models"] if m["label"] == "B")
    assert [r["rev"] for r in b["revisions"]] == [2, 1]
    assert b["revisions"][0]["latest"] is True and b["revisions"][1]["restorable"] is True
    assert b["revisions"][1]["origin"] == "from A r1"
    assert body["conflicts"] == ["B"] and body["marked_in"] == ["sandbox"]
    assert body["process"][0]["stage"]["word"] == "To-be in design"


def test_spec_live_and_restore_are_signed(empty_store: Store) -> None:
    service = Service()
    base = f"/portals/{P}/processes/pr-1"
    for path in (f"{base}/change-spec", f"{base}/live", f"{base}/models/B/restore"):
        service.routes[("POST", path)] = httpx2.Response(201, json={})
    sections = {"scope": "Quote", "delta": ["One form"]}
    with client(seed(empty_store), service) as c:
        spec = c.post(
            f"{API}/pr-1/change-spec",
            json={
                "left": {"label": "A", "rev": 1},
                "right": {"label": "B", "rev": 1},
                "sections": sections,
            },
            headers=ORIGIN,
        )
        live = c.post(
            f"{API}/pr-1/live",
            json={"environment": "staging", "label": "B", "reason": "release 9"},
            headers=ORIGIN,
        )
        restore = c.post(
            f"{API}/pr-1/models/B/restore", json={"rev": 1, "base_rev": 2}, headers=ORIGIN
        )
        bad = c.post(f"{API}/pr-1/live", json={"environment": "moon", "label": "B"}, headers=ORIGIN)
        nospec = c.post(f"{API}/pr-1/change-spec", json={"sections": "x"}, headers=ORIGIN)
    assert spec.json()["ok"] and live.json()["message"] == "Marked live in staging."
    assert restore.json()["ok"] and bad.status_code == 422 and nospec.status_code == 422
    bodies = [json.loads(r.content) for r in service.requests]
    assert bodies[0]["sections"] == sections and bodies[0]["author"] == "Anna"
    assert bodies[1] == {
        "environment": "staging",
        "label": "B",
        "reason": "release 9",
        "author": "Anna",
    }
    assert bodies[2] == {"base_rev": 2, "rev": 1, "author": "Anna"}
