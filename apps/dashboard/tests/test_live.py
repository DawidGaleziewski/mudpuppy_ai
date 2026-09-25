"""US3 / SC-003: open pages learn about store changes; dev reload uses the boot id."""

import asyncio
from pathlib import Path

from fastapi.sse import ServerSentEvent

from pathfinder_dashboard import live

from .conftest import Store, insert, make_client, ts

FAST = {"interval": 0.02, "keepalive": 10.0}


async def take(gen, n: int, timeout: float = 2.0) -> list[ServerSentEvent]:
    out: list[ServerSentEvent] = []

    async def run() -> None:
        async for ev in gen:
            out.append(ev)
            if len(out) == n:
                break

    await asyncio.wait_for(run(), timeout)
    await gen.aclose()
    return out


def test_hello_comes_first(liveinsurer_store: Store) -> None:
    gen = live.watch(liveinsurer_store.data_dir, liveinsurer_store.env, dev=True, **FAST)
    [hello] = asyncio.run(take(gen, 1))
    assert hello.event == "hello"
    assert hello.data["boot_id"] == live.BOOT_ID
    assert hello.data["dev"] is True
    assert isinstance(hello.data["data_version"], int)
    assert hello.retry == live.RETRY_MS
    assert hello.id == live.store_fingerprint(liveinsurer_store.data_dir, liveinsurer_store.env)


def test_commit_by_another_connection_emits_store_changed(liveinsurer_store: Store) -> None:
    async def scenario() -> list[ServerSentEvent]:
        gen = live.watch(liveinsurer_store.data_dir, liveinsurer_store.env, **FAST)
        hello = await gen.__anext__()
        w = liveinsurer_store.connect()
        insert(w, "runs", id="run-new", started_at=ts(300))
        w.commit()
        w.close()
        changed = await asyncio.wait_for(gen.__anext__(), 1.0)
        await gen.aclose()
        return [hello, changed]

    hello, changed = asyncio.run(scenario())
    assert changed.event == "store-changed"
    assert changed.id != hello.id


def test_no_event_when_nothing_changes(liveinsurer_store: Store) -> None:
    gen = live.watch(liveinsurer_store.data_dir, liveinsurer_store.env, max_seconds=0.2, **FAST)

    async def collect() -> list[ServerSentEvent]:
        return [ev async for ev in gen]

    events = asyncio.run(collect())
    assert [e.event for e in events] == ["hello"]


def test_keepalive_ping(liveinsurer_store: Store) -> None:
    gen = live.watch(liveinsurer_store.data_dir, liveinsurer_store.env, interval=0.02, keepalive=0.05)
    events = asyncio.run(take(gen, 2))
    assert events[1].comment == "ping"


def test_stale_last_event_id_gets_immediate_change(liveinsurer_store: Store) -> None:
    gen = live.watch(liveinsurer_store.data_dir, liveinsurer_store.env, last_event_id="stale", **FAST)
    hello, changed = asyncio.run(take(gen, 2, timeout=0.5))
    assert (hello.event, changed.event) == ("hello", "store-changed")


def test_missing_store_then_created(tmp_path: Path) -> None:
    from .conftest import make_store

    data_dir = tmp_path / "data"
    (data_dir / "db").mkdir(parents=True)

    async def scenario() -> tuple[ServerSentEvent, ServerSentEvent]:
        gen = live.watch(data_dir, "late", **FAST)
        hello = await gen.__anext__()
        make_store(data_dir, "late")
        changed = await asyncio.wait_for(gen.__anext__(), 1.0)
        await gen.aclose()
        return hello, changed

    hello, changed = asyncio.run(scenario())
    assert hello.data["data_version"] is None
    assert changed.event == "store-changed"


def test_events_route_streams_sse(liveinsurer_store: Store) -> None:
    with (
        make_client(liveinsurer_store, sse_max_s=0.1, poll_interval_s=0.02) as client,
        client.stream("GET", "/events") as response,
    ):
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        body = "".join(response.iter_text())
    assert "event: hello" in body
    assert f'"boot_id":"{live.BOOT_ID}"' in body.replace(" ", "")
    assert "retry: 2000" in body
