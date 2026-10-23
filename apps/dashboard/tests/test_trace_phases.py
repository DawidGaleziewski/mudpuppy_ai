"""A scan's phases for the Trace tab's phase bar (spec 072 FR-002; designer 19/02): work phases
from the tools called, Fill forms from a move with a form step, Waiting for you after a handoff,
Quiet for a minute or more without a call, the end's state, the axis, and the step filter."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from mudpuppy_dashboard.queries_trace_phases import axis_ticks

from .conftest import BIG_RUN, Store, insert, make_client

# (tool, start second, end second, a form step under it, a handoff in it)
CALLS = [
    ("start_run", 0, 2, False, False),
    ("navigate", 3, 5, False, False),
    ("act", 6, 8, False, False),
    ("act", 9, 11, False, False),
    ("act", 12, 14, True, False),  # Fill forms
    ("act", 15, 17, True, False),
    ("act", 18, 20, True, True),  # meets a captcha: the scan stands still 40 s
    ("act", 60, 62, True, False),
    ("act", 140, 142, False, False),  # after 78 s without a call: Quiet
    ("finish_run", 143, 144, False, False),
]


def at(second: int) -> str:
    return f"2026-10-06T10:{49 + second // 60:02d}:{second % 60:02d}.000Z"


def seed(store: Store, status: str = "interrupted") -> None:
    w = store.connect()
    insert(w, "trace_boots", id="boot-p", started_at=at(0))
    for i, (tool, start, end, form, handoff) in enumerate(CALLS, start=1):
        call = f"p-call-{i}"
        insert(
            w,
            "trace_spans",
            id=call,
            boot_id="boot-p",
            seq=i * 10,
            run_id=BIG_RUN,
            name=tool,
            started_at=at(start),
            ended_at=at(end),
            duration_ms=(end - start) * 1000,
        )
        if form:  # under the call's phase span, as the server records it
            insert(
                w,
                "trace_spans",
                id=f"{call}-ph",
                boot_id="boot-p",
                seq=i * 10 + 1,
                run_id=BIG_RUN,
                parent_id=call,
                kind="phase",
                name="settle",
                started_at=at(start),
                ended_at=at(end),
                duration_ms=1000,
            )
            insert(
                w,
                "trace_spans",
                id=f"{call}-fs",
                boot_id="boot-p",
                seq=i * 10 + 2,
                run_id=BIG_RUN,
                parent_id=f"{call}-ph",
                kind="event",
                name="form_step",
                started_at=at(start),
                duration_ms=None,
            )
        if handoff:
            insert(
                w,
                "trace_spans",
                id=f"{call}-ho",
                boot_id="boot-p",
                seq=i * 10 + 3,
                run_id=BIG_RUN,
                parent_id=call,
                kind="event",
                name="handoff",
                started_at=at(end),
                duration_ms=None,
            )
    w.execute("UPDATE runs SET status = ?, ended_at = ? WHERE id = ?", (status, at(144), BIG_RUN))
    w.commit()
    w.close()


def phases(c: TestClient) -> dict:  # type: ignore[type-arg]
    return c.get(f"/api/scans/{BIG_RUN}/trace/phases").json()


def test_the_scan_is_cut_into_its_phases(liveinsurer_store: Store) -> None:
    seed(liveinsurer_store)
    with make_client(liveinsurer_store) as c:
        body = phases(c)
    got = [(p["name"], p["kind"], p["first_step"], p["last_step"]) for p in body["phases"]]
    assert got == [
        ("Start", "work", 1, 1),
        ("Explore", "work", 2, 4),
        ("Fill forms", "work", 5, 7),
        ("Waiting for you", "wait", None, None),
        ("Fill forms", "work", 8, 8),
        ("Quiet", "quiet", None, None),
        ("Explore", "work", 9, 10),
    ]
    assert body["phases"][-1]["state"] == "failed"  # interrupted: a red end cap
    assert body["phases"][0]["time_line"] == "10:49:00Z · 3 s · step 1"
    assert body["phases"][5]["time_line"].endswith("· 1 min 18 s · no steps")
    assert body["summary"] == "6 Oct 10:49:00Z – 10:51:24Z · 2 min 24 s · 10 steps"
    assert body["axis"][0]["label"] == "10:49:00Z" and body["axis"][-1]["label"] == "10:51:24Z"


def test_a_running_scan_ends_now_and_no_trace_has_no_phases(
    liveinsurer_store: Store, client: TestClient
) -> None:
    assert phases(client)["has_phases"] is False
    seed(liveinsurer_store, status="running")
    with make_client(liveinsurer_store) as c:
        body = phases(c)
    assert body["phases"][-1]["state"] == "running"
    assert body["axis"][-1]["label"].startswith("now ")


def test_a_phase_filters_the_trace_to_its_steps(liveinsurer_store: Store) -> None:
    seed(liveinsurer_store)
    with make_client(liveinsurer_store) as c:
        some = c.get(f"/api/scans/{BIG_RUN}/trace?first=5&last=7").json()
    assert [x["id"] for x in some["items"]] == ["p-call-5", "p-call-6", "p-call-7"]
    assert some["total"] == 3


def test_the_axis_has_round_minutes_between_its_ends() -> None:
    start = datetime(2026, 10, 6, 10, 49, 20, tzinfo=UTC)
    end = datetime(2026, 10, 6, 10, 58, 44, tzinfo=UTC)
    ticks = axis_ticks(start, end)
    assert ticks[0] == (0.0, start) and ticks[-1] == (100.0, end)
    minutes = [t.minute for _, t in ticks[1:-1]]
    assert minutes == [50, 52, 54, 56, 58]
