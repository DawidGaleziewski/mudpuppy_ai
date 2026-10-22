"""Review actions from the Docs tab (spec 004 US3, research §1, constitution 1.4.0).

The dashboard never opens a writable connection. A review runs the TypeScript operator command
``pnpm docs:review`` in ``apps/crawler`` with one JSON object on stdin; that command validates with
Zod and writes in one transaction. Its one-line JSON result is mapped to an HTTP status here.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from typing import Any

from .settings import Settings

# Refusal codes of `docs:review` (contracts/operator-cli.md) -> HTTP status for the panel.
_STATUS = {
    "STALE_REVISION": 409,
    "NOT_CANCELLABLE": 409,
    "SCHEMA_INVALID": 422,
    "RECORD_NOT_FOUND": 404,
    "UNKNOWN_REF": 404,
}


@dataclass(frozen=True)
class ReviewOutcome:
    http_status: int
    ok: bool
    body: dict[str, Any]

    @property
    def message(self) -> str:
        err = self.body.get("error") or {}
        return str(err.get("message", "")) if not self.ok else ""

    @property
    def code(self) -> str | None:
        err = self.body.get("error") or {}
        return err.get("code") if not self.ok else None


def submit_review(
    settings: Settings,
    env: str,
    *,
    portal_id: str,
    key: str,
    rev_no: int,
    action: str,
    text: str | None,
) -> ReviewOutcome:
    """Run ``docs:review`` once; never raises for a refusal, only maps it."""
    if not settings.reviewer:
        return ReviewOutcome(403, False, _error("REVIEW_DISABLED", "no reviewer is configured"))
    payload: dict[str, Any] = {
        "portal_id": portal_id,
        "key": key,
        "rev_no": rev_no,
        "action": action,
        "reviewer": settings.reviewer,
    }
    if text:
        payload["text"] = text
    cmd = [
        "pnpm",
        "--silent",
        "--dir",
        str(settings.crawler_dir),
        "docs:review",
        "--env",
        env,
        "--root",
        str(settings.data_dir.parent),
    ]
    try:
        proc = subprocess.run(
            cmd,
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            timeout=settings.review_timeout_s,
            check=False,
        )
    except FileNotFoundError:
        return ReviewOutcome(500, False, _error("REVIEW_UNAVAILABLE", "pnpm is not installed"))
    except subprocess.TimeoutExpired:
        return ReviewOutcome(500, False, _error("REVIEW_TIMEOUT", "docs:review did not answer"))
    body = _last_json_line(proc.stdout)
    if body is None:
        detail = (proc.stderr or proc.stdout).strip().splitlines()[-1:] or ["no output"]
        return ReviewOutcome(500, False, _error("UNEXPECTED", detail[0][:300]))
    if proc.returncode == 0 and body.get("ok") is True:
        return ReviewOutcome(200, True, body)
    if proc.returncode == 2:
        code = (body.get("error") or {}).get("code", "")
        return ReviewOutcome(_STATUS.get(code, 422), False, body)
    return ReviewOutcome(500, False, body)


def _last_json_line(stdout: str) -> dict[str, Any] | None:
    for line in reversed(stdout.strip().splitlines()):
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    return None


def _error(code: str, message: str) -> dict[str, Any]:
    return {"ok": False, "error": {"code": code, "message": message}}
