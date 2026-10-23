"""`uv run mudpuppy-dashboard-smoke [--base URL] [--env E]` — check a RUNNING dashboard.

1. ``/healthz`` code fingerprint vs the files on disk: a server started before the latest code
   change is reported as STALE (restart it, or run it with ``--dev``).
2. The React console's shell (``/app/``) and every read of the JSON API it makes for each portal
   of the store (Home, Changes, Review, Processes, Screens and their map, Rules, Docs, Scans,
   Settings, Access, …) must answer 200 within a second. Read-only: GET only.

Exit 0 when everything is fine, 1 on any finding, 2 when the server cannot be reached.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import quote, urlencode

from .version import code_fingerprint

#: What the console reads without a portal.
GLOBAL = ("/app/", "/api/portals", "/api/portals/overview", "/api/glossary", "/api/activity")
#: What it reads for each portal (`{p}`): one address per page of the console.
PER_PORTAL = (
    "/api/portals/{p}/home",
    "/api/portals/{p}/changes",
    "/api/portals/{p}/review",
    "/api/portals/{p}/processes",
    "/api/portals/{p}/screens",
    "/api/portals/{p}/map/recorded",
    "/api/portals/{p}/screens/recorded",
    "/api/portals/{p}/rules",
    "/api/portals/{p}/docs",
    "/api/portals/{p}/scans",
    "/api/portals/{p}/scans/plan",
    "/api/portals/{p}/scans/by-process",
    "/api/portals/{p}/settings",
    "/api/portals/{p}/access",
    "/api/portals/{p}/same-screen",
    "/api/portals/{p}/model-versions",
    "/api/portals/{p}/assistant",
)
BUDGET_S = 1.0


def _get(url: str, timeout: float = 10.0) -> tuple[int, str, float]:
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            body = r.read().decode("utf-8", "replace")
            return r.status, body, time.perf_counter() - started
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), time.perf_counter() - started


def addresses(portals: list[str], env: str | None) -> list[str]:
    """Every address the check asks for, with `env` when one is asked for."""
    paths = [*GLOBAL, *(t.format(p=quote(p, safe="")) for p in portals for t in PER_PORTAL)]
    suffix = f"?{urlencode({'env': env})}" if env else ""
    return [f"{p}{suffix}" for p in paths]


def run(base: str, env: str | None) -> int:
    base = base.rstrip("/")
    query = f"?{urlencode({'env': env})}" if env else ""
    try:
        status, body, _ = _get(f"{base}/healthz{query}")
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
    status, body, _ = _get(f"{base}/api/portals{query}")
    portals = [p["id"] for p in json.loads(body).get("portals", [])] if status == 200 else []
    slow: list[tuple[float, str]] = []
    every = addresses(portals, env)
    for path in every:
        status, _, took = _get(f"{base}{path}")
        if status != 200:
            findings.append(f"{status} {path}")
        elif took > BUDGET_S:
            slow.append((took, path))
    for took, path in sorted(slow, reverse=True)[:5]:
        findings.append(f"SLOW {took:.2f}s {path} (budget {BUDGET_S:.0f} s)")
    print(f"checked {len(every)} addresses for {len(portals)} portals, code {served}")
    for f in findings:
        print(f"  - {f}")
    print("OK" if not findings else f"{len(findings)} finding(s)")
    return 0 if not findings else 1


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="mudpuppy-dashboard-smoke", description=__doc__)
    p.add_argument("--base", default="http://127.0.0.1:8765", help="dashboard URL")
    p.add_argument("--env", help="environment to check (default: the server's)")
    a = p.parse_args(argv)
    sys.exit(run(a.base, a.env))


if __name__ == "__main__":
    main()
