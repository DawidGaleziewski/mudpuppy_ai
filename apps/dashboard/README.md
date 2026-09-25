# apps/dashboard — pathfinder://console

A local, **read-only** operator dashboard over the crawler's SQLite store
(`data/db/<env>.sqlite`). It shows every portal's runs, how they ended and why, and for each run
the states, actions (with safety class), frontier, forms, network call shapes, robots.txt policies
and the decision log, with confidence and evidence on every record. Open pages update live while
the crawler writes.

Spec: [`specs/003-dashboard-ui/`](../../specs/003-dashboard-ui/) (R-12).

## Run

```bash
cd apps/dashboard
uv sync
uv run pathfinder-dashboard            # http://127.0.0.1:8765, environment "production"
uv run pathfinder-dashboard --dev      # reloads the server and open pages on code/template edits
uv run pathfinder-dashboard --env scratch --port 9000 --data-dir /path/to/data
```

Settings can also come from the environment: `PATHFINDER_DATA_DIR`, `PATHFINDER_DEFAULT_ENV`,
`PATHFINDER_PORT`, `PATHFINDER_DEV`. The data dir defaults to the repo's `data/` (the nearest
ancestor holding `data/migrations`). Every `data/db/*.sqlite` file is an environment; switch in
the top bar (`?env=` on any URL).

## Test

```bash
uv run pytest                                   # 100+ tests, fixture stores built from data/migrations
uv run ruff check . && uv run ruff format --check .
```

## Guarantees

- **Read-only.** The store is opened `file:…?mode=ro` with `PRAGMA query_only = ON`; the process
  cannot write even through a bug, and a missing store is reported, never created.
  `tests/test_readonly.py` hashes the store before and after hitting every route.
- **Local only.** Binds `127.0.0.1`; the config snapshot shows operator contact data.
- **Schema drift fails loudly.** `models.py` mirrors every table; `tests/test_models_schema.py`
  compares fields and enums against a store built from `data/migrations/*.up.sql`.

## How live updates work

`GET /events` is one Server-Sent Events stream per page (FastAPI `EventSourceResponse`). It polls
`PRAGMA data_version` every second on its own read-only connection and sends `store-changed` when
another connection (the crawler) has committed. Every region on a page that shows store data is a
**live region**: it re-fetches its own fragment on `store-changed`, keeping its filters. The first
event, `hello`, carries a per-process `boot_id`; with `--dev`, a changed `boot_id` after a restart
reloads the page. If the stream drops, a banner says the view may be stale until it reconnects.

## Layout

```text
src/pathfinder_dashboard/
  settings.py   db.py (read-only connection)   models.py (read models)
  queries.py    (pure SQL → models, keyset pagination)
  live.py       (SSE watcher)   app.py (routes)   __main__.py (CLI)
  templates/    pages + partials/ (one partial per live region; macros.html holds status labels)
  static/       css/tokens.css (the only literal values), css/app.css, js/live.js,
                vendor/ (htmx 4 + hx-sse, pinned, see vendor/README.md), fonts/ (JetBrains Mono)
tests/          fixture stores in conftest.py
```

## Changing the UI

UI work follows the project design system: skill `revamp-dashboard`
(`.claude/skills/revamp-dashboard/`), in particular `references/pathfinder-console.md` for this
product's status labels, accent mapping and the live-region pattern. The `frontend-dev` agent
(`.claude/agents/frontend-dev.md`) owns UI changes. New colours, sizes or spacing go in
`static/css/tokens.css` only; `tests/test_tokens.py` fails on literals in `app.css`.
