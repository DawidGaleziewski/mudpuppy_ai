"""One grammar for every scan line (spec 072 FR-010; designer answer 19/12):

    [status] {Kind} {13-character id} · {done} / {limit} {unit} · {pages} pages · {queued} queued
    · {where or when}

Kind is "AI scan" or "Check run" (a probe-mode run, no AI), never "Scan" alone. The last part:
running with steps arriving, "now at /porownanie"; running without a new step for 2 min or more,
"no new step for 9 min" (muted, the status stays Running); stopped, "at /kontakt"; completed, its
end time "17 Oct 10:05Z". Minutes are written "min".
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

#: Running this long without a new step, the line says so (it doesn't flicker on short pauses).
QUIET_MS = 2 * 60_000


def kind_word(mode: str) -> str:
    return "Check run" if mode == "probe" else "AI scan"


def progress_words(mode: str, done: int, limit: int | None, pages: int, queued: int) -> str:
    """'12 / 120 steps · 9 pages · 3 queued'; a check run counts checks."""
    count = f"{done} / {limit}" if limit else str(done)
    if mode == "probe":
        return f"{count} checks"
    return f"{count} steps · {pages} pages · {queued} queued"


def when_words(iso: str) -> str:
    """'17 Oct 10:05Z' (UTC, as stored)."""
    at = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return f"{at.day} {at.strftime('%b %H:%M')}Z"


@dataclass(frozen=True)
class Last:
    text: str
    muted: bool = False


def last_words(
    status: str, quiet_ms: int | None, here: str | None, ended_at: str | None
) -> Last | None:
    """Where the scan is or when it ended."""
    if status == "running":
        if quiet_ms is not None and quiet_ms >= QUIET_MS:
            return Last(f"no new step for {quiet_ms // 60_000} min", muted=True)
        return Last(f"now at {here}") if here else None
    if status == "completed":
        return Last(when_words(ended_at)) if ended_at else None
    return Last(f"at {here}") if here else None
