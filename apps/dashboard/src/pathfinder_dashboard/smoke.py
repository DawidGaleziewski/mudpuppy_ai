"""`uv run pathfinder-dashboard-smoke [--base URL] [--env E]` — check a RUNNING dashboard.

1. ``/healthz`` code fingerprint vs the files on disk: a server started before the latest code
   change is reported as STALE (restart it, or run it with ``--dev``).
2. Every same-origin page and live fragment reachable from ``/``, ``/docs`` and ``/activity``
   (``href`` and ``hx-get``), breadth first, must answer 200. Read-only: GET only.

Exit 0 when everything is fine, 1 on any finding, 2 when the server cannot be reached.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from collections import deque
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

from .version import code_fingerprint

_LINK = re.compile(r'(?:href|hx-get)="([^"]+)"')
# Static files and the event stream are not pages; a `cursor` is dropped in `_normalise`.
_SKIP_PREFIXES = ("/static/", "/events")


def _get(url: str, timeout: float = 10.0) -> tuple[int, str, float]:
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            body = r.read().decode("utf-8", "replace")
            return r.status, body, time.perf_counter() - started
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), time.perf_counter() - started


def _normalise(base: str, href: str, env: str | None) -> str | None:
    href = html.unescape(href)
    if href.startswith(("#", "mailto:", "javascript:")):
        return None
    url = urljoin(base, href)
    parts = urlsplit(url)
    if (parts.scheme, parts.netloc) != tuple(urlsplit(base)[:2]):
        return None
    if parts.path.startswith(_SKIP_PREFIXES):
        return None
    query = dict(parse_qsl(parts.query))
    query.pop("cursor", None)
    if env and "env" not in query:
        query["env"] = env
    return urlunsplit(("", "", parts.path, urlencode(sorted(query.items())), ""))


def run(base: str, env: str | None, max_pages: int) -> int:
    base = base.rstrip("/") + "/"
    try:
        status, body, _ = _get(urljoin(base, "healthz" + (f"?env={env}" if env else "")))
    except OSError as e:
        print(f"UNREACHABLE {base}: {e}")
        return 2
    findings: list[str] = []
    health = json.loads(body) if status == 200 else {}
    served, on_disk = health.get("code"), code_fingerprint()
    if served != on_disk:
        findings.append(
            f"STALE server: serves code {served}, files on disk are {on_disk}; restart it"
        )
    if not health.get("ok"):
        findings.append(f"store missing for env {env or '(default)'}: {health.get('store')}")

    queue: deque[str] = deque()
    seen: set[str] = set()
    for start in ("/", "/docs", "/activity"):
        u = _normalise(base, start, env)
        if u:
            queue.append(u)
            seen.add(u)
    slow: list[tuple[float, str]] = []
    checked = 0
    while queue and checked < max_pages:
        path = queue.popleft()
        status, body, took = _get(urljoin(base, path.lstrip("/")))
        checked += 1
        if status != 200:
            findings.append(f"{status} {path}")
            continue
        if took > 1.0:
            slow.append((took, path))
        for href in _LINK.findall(body):
            u = _normalise(base, href, env)
            if u and u not in seen:
                seen.add(u)
                queue.append(u)

    for took, path in sorted(slow, reverse=True)[:5]:
        findings.append(f"SLOW {took:.2f}s {path} (budget 1 s)")
    print(f"checked {checked} pages/fragments ({len(seen)} found), code {served}")
    for f in findings:
        print(f"  - {f}")
    if queue:
        print(f"  (stopped at --max-pages {max_pages}; {len(queue)} not checked)")
    print("OK" if not findings else f"{len(findings)} finding(s)")
    return 0 if not findings else 1


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="pathfinder-dashboard-smoke", description=__doc__)
    p.add_argument("--base", default="http://127.0.0.1:8765", help="dashboard URL")
    p.add_argument("--env", help="environment to check (default: the server's)")
    p.add_argument("--max-pages", type=int, default=400)
    a = p.parse_args(argv)
    sys.exit(run(a.base, a.env, a.max_pages))


if __name__ == "__main__":
    main()
