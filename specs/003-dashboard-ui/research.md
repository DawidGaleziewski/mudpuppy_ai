# Research: Dashboard UI

## §1 Rendering model: server-rendered HTML + htmx 4

- **Decision**: Jinja2 templates rendered by FastAPI; htmx 4.0 for in-place fragment swaps
  (filters, pagination, live refresh). Vendored under `static/vendor/`.
- **Rationale**: The user asked for "light htmx". No JS build, no client state, a single language
  on the server; fragments are the same templates as the full page (`partials/`).
- **Alternatives**: htmx 2.x + `htmx-ext-sse` (stable and familiar, but 4.0 is released and the
  2→4 attribute changes, `sse-connect` → `hx-sse:connect`, would be a migration later); a SPA
  (React/Vue) rejected as out of proportion for three read-only screens.
- **Note**: htmx 4 named SSE events are dispatched as DOM events instead of swapped; regions
  refresh with `hx-trigger="store-changed from:body"` (htmx 4 docs, `extensions/hx-sse`).

## §2 Reading the crawler's DB safely

- **Decision**: open `file:<path>?mode=ro` with `uri=True`, then `PRAGMA query_only = ON` and
  `busy_timeout = 2000`. One short-lived connection per request; one long-lived connection in the
  SSE watcher.
- **Rationale**: The crawler writes in WAL mode (`apps/crawler/packages/core/src/db.ts`). WAL
  readers never block the writer and see a consistent snapshot per transaction. `mode=ro` means the
  process cannot write even through a bug; `query_only` is a second guard.
- **Caveat**: a WAL read-only reader needs the `-shm` file to exist or the directory to be
  writable; the crawler creates it. If the store is missing, the app shows an error state (FR-010)
  instead of creating an empty DB (which `mode=rw` would do).
- **Alternatives**: `immutable=1` rejected (would miss live changes and can read torn data while
  the crawler writes).

## §3 Live updates: `PRAGMA data_version` over SSE

- **Decision**: `/events` is a FastAPI `EventSourceResponse` (native `fastapi.sse`). A watcher polls
  `PRAGMA data_version` on its own connection every 1 s; when the value changes it emits
  `event: store-changed`. Live regions carry `hx-get` + `hx-trigger="store-changed from:body"` and
  re-fetch themselves. A `: ping` comment every 15 s keeps proxies and the browser from timing out.
- **Rationale**: `data_version` changes exactly when another connection commits to the file, at
  near-zero cost, and fits the ≤3 s budget (SC-003). Sending "something changed" rather than HTML
  keeps one source of truth for each fragment (its GET route) and makes filters and pagination
  survive live refreshes (the region re-requests with its current query).
- **Alternatives**: filesystem watch (inotify) on the `-wal` file, rejected (WSL on `/mnt` drives
  does not deliver inotify reliably; checkpoint noise); periodic `hx-trigger="every 2s"` polling
  per region, rejected (N queries per page per tick even when nothing changed).
- **Connection lost** (US3 scenario 3): `live.js` listens for the `hx-sse` error/close events,
  shows the "view may be stale" banner, hides it on reopen; EventSource reconnects on its own.

## §4 Pydantic read models vs the Zod source of truth

- **Decision**: `models.py` has one Pydantic model per table, field names identical to columns;
  JSON columns are parsed to `dict | list` (kept raw if parsing fails). A test builds a store from
  `data/migrations/*.up.sql` and asserts each model's fields equal `PRAGMA table_info` columns.
- **Rationale**: FR-015. The constitution makes Zod the truth for writes; the dashboard never
  writes, so the mirror only needs to *fail loudly* when the schema moves. The migrations are the
  shared ground truth for both.
- **Alternatives**: generating models from the Zod schemas via JSON Schema, rejected for v1 (adds a
  Node step to a Python build); worth revisiting if the tables grow.

## §5 Dev reload ("updated live when we push changes", second reading)

- **Decision**: `pathfinder-dashboard --dev` runs uvicorn with `reload=True` and
  `reload_includes=["*.html", "*.css", "*.js"]`. Each process has a random `boot_id`, sent as the
  first SSE event (`event: hello`). `live.js` in dev mode compares it to the one it first saw and
  calls `location.reload()` when it differs (the server restarted after a code change).
- **Rationale**: Reuses the one SSE stream; no extra livereload dependency. Off unless `--dev`.
- **Alternatives**: `arel` / `jinja2-livereload` packages, rejected as an extra dependency for
  ~10 lines.

## §6 Design system application

- **Decision**: install the package as `.claude/skills/revamp-dashboard/` (copy, keeping
  `user_input/ux-package` as the user's original) and adopt the bundled Console system unchanged,
  identity colour amber. Add the three product-specific pieces the system asks for in
  `references/pathfinder-console.md`: name `pathfinder://console`, a mark built from the same
  node-and-edge unit as the state graph, and the entity→accent mapping (contracts/ui-conventions.md).
- **Rationale**: The user supplied this design system; the skill's Step 0 is satisfied by it.
- **Tokens**: `static/css/tokens.css` is the only place a colour, size or spacing literal appears;
  `app.css` uses `var(--…)` only (checked by a test that greps `app.css` for hex literals).

## §7 Store discovery and environments

- **Decision**: data dir defaults to `<repo>/data` (found by walking up from the app to the
  directory that contains `data/migrations`), overridable by `PATHFINDER_DATA_DIR`. Environments
  are the `data/db/*.sqlite` files; default `production` if present, else the first. An environment
  switch sits in the nav.
- **Rationale**: matches the crawler's `data/db/<env>.sqlite` convention (mcp-server `context.ts`).

## §8 Large lists

- **Decision**: actions and frontier are shown as counts by status/class plus a paginated table
  (50 per page, keyset on `id`, which is UUIDv7 and time-ordered); decision log grouped by
  `(kind, rule)` with counts, entries paginated.
- **Rationale**: SC-005 with 10⁴ items; keyset pagination is O(page) on the existing primary keys,
  so no new index is needed. Counts use `GROUP BY` over `run_id`, covered by `ix_frontier_queue`
  for the frontier; `actions`/`decision_log` have no `run_id` index, measured in T040 and flagged
  to `db-admin` only if SC-005 fails.

## §9 Security and privacy

- **Decision**: bind `127.0.0.1` only; no auth in v1; responses set `Cache-Control: no-store`.
  Jinja autoescape on (portal titles and accessible names are untrusted page content); JSON is
  rendered as escaped text inside `<pre>`.
- **Rationale**: `config_snapshot` carries operator contact data (User-Agent contact, reviewer
  name); the tool is for the local operator. Untrusted portal strings must never become markup.
