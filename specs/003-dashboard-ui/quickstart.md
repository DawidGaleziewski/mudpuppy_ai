# Quickstart: Dashboard UI

Validation guide for R-12. Details live in [contracts/](contracts/) and [data-model.md](data-model.md).

## Prerequisites

- `uv` ≥ 0.12 on PATH (Python 3.13 is fetched by uv if missing).
- A crawl store at `data/db/<env>.sqlite` (the liveinsurer runs of 2026-09-25 are in `production`).

## Run

```bash
cd apps/dashboard
uv sync
uv run pathfinder-dashboard            # http://127.0.0.1:8765
uv run pathfinder-dashboard --dev      # reloads server and open pages on code/template changes
PATHFINDER_DATA_DIR=/path/to/data uv run pathfinder-dashboard --env production
```

## Test

```bash
cd apps/dashboard
uv run pytest
uv run ruff check . && uv run ruff format --check .
```

## Validation scenarios

1. **Overview matches the store (US1, SC-002)**: open `/`. Portal `liveinsurer` shows 9 runs:
   7 `[INT.]` and 2 `[STOP]`; the two `[STOP]` rows show the reCAPTCHA warning text. The
   automated check is `tests/test_queries.py`, which compares every count with direct SQL on a
   fixture store.
2. **Run detail (US2)**: open the runs with steps > 0. Across all runs the store holds 600
   frontier items (549 pending, 2 done, 30 skipped unsafe, 10 unreachable, 6 robots-disallowed,
   3 denylisted) and decisions grouped as `ceiling:read` (30), `click_failed` (10),
   `robots:Disallow: *cHash*` (6); each run's detail shows its share of these. Each state shows
   `observed` and its evidence reference.
3. **Filters in place (US2 scenario 3)**: pick decision kind `skip`; only skip entries remain; the
   URL carries `?kind=skip`; reload keeps the filter.
4. **Live update (US3, SC-003)**: copy the store to a scratch env
   (`cp data/db/production.sqlite* data/db/scratch.sqlite…`), open `/?env=scratch`, then insert a
   run row into the scratch copy with Python's `sqlite3`. It appears in the runs table within 3 s
   without reload. Never write to `production.sqlite`.
5. **Connection lost (US3 scenario 3)**: stop the server with the page open; the stale banner
   appears; restart; the banner disappears and data refreshes.
6. **Dev reload (FR-014)**: with `--dev`, edit a template; the open page reloads by itself.
7. **Read-only (SC-004)**: `uv run pytest tests/test_readonly.py`; and manually `sha256sum
   data/db/production.sqlite` before and after browsing all pages: identical.
8. **Empty / missing store (FR-010)**: `PATHFINDER_DATA_DIR=/tmp/empty uv run pathfinder-dashboard`
   shows the error state naming the path; a store with no runs shows the empty state.
9. **Frontend agent (US4)**: `.claude/agents/frontend-dev.md` exists, lints clean with the
   subagent-authoring linter, and points to skill `revamp-dashboard`.
