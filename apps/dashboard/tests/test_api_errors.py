"""The React console's error reference (R-100, spec 071): the assistant's log line behind an ERR-
reference, read through the chat service."""

from __future__ import annotations

import httpx2

from .conftest import Store
from .test_chat import Service, make_chat_client


def test_an_error_reference_gives_its_log_line(empty_store: Store) -> None:
    service = Service()
    line = {
        "ref": "ERR-0001-ab",
        "time": "2026-10-05T10:00:00.000Z",
        "message": "boom",
        "detail": {"a": 1},
    }
    service.routes[("GET", "/errors/ERR-0001-ab")] = httpx2.Response(200, json=line)
    with make_chat_client(empty_store, service) as c:
        found = c.get("/api/errors/ERR-0001-ab").json()
        malformed = c.get("/api/errors/not-a-ref").json()
    assert found["entry"] == line and found["unavailable"] is False
    assert malformed["entry"] is None
    assert all(q.url.path != "/errors/not-a-ref" for q in service.requests)


def test_an_error_reference_when_the_assistant_is_down(empty_store: Store) -> None:
    with make_chat_client(empty_store, Service(up=False)) as c:
        r = c.get("/api/errors/ERR-1-a").json()
    assert r["unavailable"] is True and "pnpm --dir apps/chat start" in r["start"]
