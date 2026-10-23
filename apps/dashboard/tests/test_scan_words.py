"""One grammar for every scan line (spec 072 FR-010; designer 19/12)."""

from __future__ import annotations

from mudpuppy_dashboard.scan_words import (
    Last,
    kind_word,
    last_words,
    progress_words,
    when_words,
)


def test_the_kind_is_ai_scan_or_check_run() -> None:
    assert kind_word("map") == "AI scan" and kind_word("trace") == "AI scan"
    assert kind_word("probe") == "Check run"


def test_progress_counts_steps_pages_and_queued_or_checks() -> None:
    assert progress_words("map", 12, 120, 9, 3) == "12 / 120 steps · 9 pages · 3 queued"
    assert progress_words("map", 12, None, 9, 0) == "12 steps · 9 pages · 0 queued"
    assert progress_words("probe", 40, 64, 0, 0) == "40 / 64 checks"


def test_the_last_part_says_where_or_when() -> None:
    assert last_words("running", 30_000, "/porownanie", None) == Last("now at /porownanie")
    assert last_words("running", 9 * 60_000, "/x", None) == Last("no new step for 9 min", True)
    assert last_words("running", 119_000, None, None) is None  # under 2 min, nowhere yet
    assert last_words("interrupted", None, "/kontakt", None) == Last("at /kontakt")
    done = last_words("completed", None, "/x", "2026-10-17T10:05:12.000Z")
    assert done == Last("17 Oct 10:05Z")
    assert when_words("2026-10-07T09:00:00Z") == "7 Oct 09:00Z"
