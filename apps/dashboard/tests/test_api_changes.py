"""The React console's What changed and Before / after (R-96, spec 064): the range, groups and
explanations, statuses mapped, the release lanes, and one change with its
sides, changed region, what differs and the changes that need you around it."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from mudpuppy_dashboard import queries_app_change as qac

from .conftest import Store, ts
from .test_changes import (
    P,
    client,
    seed,
    seed_new_button,
    seed_process_and_releases,
    seed_rule_and_rename,
)

API = f"/api/portals/{P}/changes"


def test_the_list_groups_changes_with_mapped_statuses(empty_store: Store) -> None:
    seed(empty_store)
    seed_rule_and_rename(empty_store)
    body = client(empty_store).get(API).json()
    assert body["has_model"] and body["counts"] == {
        "all": 4,
        "needs": 2,
        "explained": 2,
        "waiting": 1,
    }
    (group,) = body["groups"]
    assert group["key"] is None and group["name"] == "Not in a process"
    (screen,) = group["screens"]
    assert screen["key"] == "SC-0001" and screen["count"] == 4 and screen["needs"] == 2
    first = screen["changes"][0]
    assert first["status"] == {"shape": first["status"]["shape"], "word": "Needs you"}
    explained = next(c for c in screen["changes"] if c["id"] == "d1")
    assert explained["explanation"] == {"word": "Release", "variant": None}
    assert explained["hypothesis_key"] == "H-0001" and explained["reason"] is None
    legend = {row["chip"]["word"]: row["count"] for row in body["legend"]}
    assert legend["Release"] == 1 and legend["Part of a rename"] == 1
    assert body["statuses"][0]["word"] == "Needs you"
    assert {"value": "new_action", "label": "New action"} in body["kinds"]


def test_filters_narrow_the_list_and_keep_the_counts(empty_store: Store) -> None:
    seed(empty_store)
    c = client(empty_store)
    needs = c.get(f"{API}?show=needs").json()
    assert needs["show"] == "needs" and needs["shown"] == 2 and needs["counts"]["all"] == 3
    kind = c.get(f"{API}?kind=new_action").json()
    assert kind["shown"] == 1 and kind["kind"] == "new_action"
    later = c.get(f"{API}?from_seq=2").json()
    assert later["shown"] == 0 and later["range"]["how"] == "version"


def test_the_range_has_its_choices_and_the_release_lanes(empty_store: Store) -> None:
    seed(empty_store)
    seed_process_and_releases(empty_store)
    c = client(empty_store)
    body = c.get(API).json()
    r = body["range"]
    assert r["how"] == "release" and r["from_seq"] == 1 and r["to_seq"] == 2
    assert r["froms"][0] == {"value": "", "label": "Since the previous release"}
    assert r["tos"][0]["label"].startswith("Now · Model version 2")
    assert r["scans"][0]["value"] == "r1"
    rel = body["releases"]
    (lane,) = rel["lanes"]
    assert lane["name"] == "Shell"
    assert [s["name"] for s in lane["spans"]] == ["1d77", "both", "3e1a"]
    assert lane["spans"][1]["rollout"] and lane["spans"][2]["current"]
    assert lane["spans"][0]["href"].startswith(f"/app/portals/{P}/changes?from_date=")
    assert rel["range_label"] == "this range · 3 changes" and rel["scans"][0]["id"] == "r1"
    assert body["groups"][0]["key"] == "PRC-001"
    assert {"value": "PRC-001", "label": "Oblicz składkę · 3"} in body["processes"]
    by_date = c.get(f"{API}?from_date={ts(3)}").json()["range"]
    assert by_date["how"] == "date" and "after version 2" in by_date["froms"][1]["label"]


def test_without_a_model_the_page_says_so(empty_store: Store) -> None:
    from .conftest import insert

    conn = empty_store.connect()
    insert(conn, "runs", id="r0", portal_id=P, status="completed", started_at=ts(0))
    conn.commit()
    conn.close()
    body = client(empty_store).get(API).json()
    assert body["has_model"] is False and body["range"] is None and body["groups"] == []


def test_one_change_has_its_sides_region_and_neighbours(empty_store: Store) -> None:
    seed_new_button(empty_store)
    c = client(empty_store)
    d = c.get(f"{API}/d7").json()
    assert d["change"]["finding"] == "Dalej appeared without a release."
    assert d["before"]["label"] == "Before" and not d["before"]["has_change"]
    assert d["after"]["has_change"] and d["after"]["shot"] == f"/evidence/{'b' * 64}.png"
    assert d["after"]["status"] == {"shape": "ok", "word": "Observed"}
    assert d["region"] == {"left": 10.0, "top": 10.0, "width": 20.0, "height": 5.0}
    # the before side has no layout: "Not here" is a box at the same place (designer Q5a)
    assert d["gone"] == {"shape": "box", "left": 10.0, "top": 10.0, "width": 20.0, "height": 5.0}
    assert d["decidable"] and d["hypothesis_status"]["word"]
    assert d["process"] == {"value": "PRC-001", "label": "Oblicz składkę"}
    assert d["back"] == f"/app/portals/{P}/changes?process=PRC-001"
    nb = d["neighbours"]
    assert nb["total"] == 3 and (nb["prev"] or nb["next"])
    variant = c.get(f"{API}/d1").json()
    assert variant["before"]["label"] == "Known variant" and variant["explained"]
    assert variant["neighbours"] is None and not variant["decidable"]
    release = next(x for x in variant["differs"] if x["label"] == "Release · Shell")
    assert (release["before"], release["after"], release["differs"]) == ("1d77", "3e1a", True)


def test_a_change_waiting_for_a_check_is_not_decided_here(empty_store: Store) -> None:
    seed(empty_store)
    c = client(empty_store)
    d = c.get(f"{API}/d3").json()
    assert d["change"]["explanation"]["word"] == "Being checked" and d["tests"] == []
    assert not d["decidable"] and not d["rule_link"] and d["hypothesis_status"] is None
    assert c.get(f"{API}/nope").status_code == 404
    assert c.get("/api/portals/no-such-portal/changes").status_code == 404


def test_not_here_is_a_line_where_an_inserted_region_pushed_the_page(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Designer Q5a: the marked page is taller by the region's height → a line at the insertion
    point on the other picture; otherwise a box placed in that picture's own percent."""
    heights = {"after": 1100.0, "before": 1000.0}
    monkeypatch.setattr(qac, "_page_height", lambda _d, ref: heights[ref])
    d = SimpleNamespace(
        marked_side="after",
        before=SimpleNamespace(layout_ref="before"),
        after=SimpleNamespace(layout_ref="after"),
    )
    banner = qac.Region(left=0, top=10, width=100, height=100 / 11)  # 100 px of 1100
    line = qac._gone(Path(), d, banner)  # type: ignore[arg-type]
    assert line is not None and line.shape == "line" and line.height == 0
    assert round(line.top, 3) == 11.0  # 110 px of the 1000 px page
    heights["before"] = 1100.0
    box = qac._gone(Path(), d, banner)  # type: ignore[arg-type]
    assert box is not None and box.shape == "box" and round(box.height, 3) == round(100 / 11, 3)
    assert qac._gone(Path(), d, None) is None  # type: ignore[arg-type]
