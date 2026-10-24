# mudpuppy-dashboard

The JSON API over the crawler's SQLite store that the React console (`apps/web`) reads, the relay
to the chat service, the evidence files, and the console itself at `/app/` (R-100: the console is
a React single-page app; the dashboard has no pages of its own). Read-only on the store.

Layer: app (Python, FastAPI, uv; outside the TS layers)

## Run
- `pnpm --dir apps/web build`, then `cd apps/dashboard && uv sync && uv run mudpuppy-dashboard` →
  http://127.0.0.1:8765/app/.
- Dev mode: `uv run mudpuppy-dashboard --dev` (with `pnpm --dir apps/web dev` on 5173).
- Env: `MUDPUPPY_DATA_DIR`, `MUDPUPPY_DEFAULT_ENV`, `MUDPUPPY_PORT`, `MUDPUPPY_DEV`; chat service URL `MUDPUPPY_CHAT_URL` (see README).
- Workbench beta (spec 043): on by default, `MUDPUPPY_WORKBENCH=0` hides it; `MUDPUPPY_WORKBENCH_MODEL=0`
  turns the assistant off (live views stay), `MUDPUPPY_WORKBENCH_COMMANDS=0` pauses the cards;
  `MUDPUPPY_WORKBENCH_COMMAND_ENVS` (default `local-dev,sandbox`, read by the chat service too)
  lists the environments where commands may run (spec 048, D-6).

## Layout
- `app.py` only builds the app; `web/deps.py` holds `Ctx` and `Web` (`web_of(request)`);
  `web/api_<page>.py` is one `APIRouter` per console page under `/api`, with typed response
  models; `web/legacy.py` redirects every old address to its React page.
- `queries*.py`: the read models (`queries_app_*.py` shape them as the console's JSON);
  `models.py`: read-only models of the schema (drift test vs. `data/schema/schema.sql`).
- Writes go through the chat service (`chat_client.py`, `web/chat_writes.py`, the relay
  `web/chat_relay.py`); `as_of.py` serves past model versions.
- **Where each router and read model lives: `LAYOUT.md`.** Read it before changing one.

## Invariants
- Reads DB read-only (test_readonly); every write goes through the chat service.
- No SQL in routers (G-15); a router never imports another router (G-13).
- Every status leaves the API mapped (`status_map.py`, `{shape, word}`); the console never maps.
- UI work happens in `apps/web` (skills `mudpuppy-react-ui`, `mudpuppy-salvage-ui`).

## Where to add things
- A console page's data: a read model in `queries_app_<page>.py` (pytest first), a route in
  `web/api_<page>.py` (follow `web/api_screens.py`), included in `app.py`, a line in `LAYOUT.md`.

## Tests
- `uv run ruff check && uv run pytest -n auto -m 'not perf and not serial' && uv run pytest -m 'perf or serial'`
  (pytest-xdist, about 40 s; the `perf` wall-clock tests and the load-sensitive `serial` tests run
  alone).
- Complexity: `uv run ruff check --select C901,PLR0912,PLR0913,PLR0915 --exit-zero`.
- Mutation testing, on demand only (G-32): `uv run mutmut run`, then `uv run mutmut results`; only
  the test files in `pytest_add_cli_args_test_selection` run (add a new test file of a mutated
  module there; the mutated modules are `diagrams.py`, `glossary.py`, `visuals.py` per
  `[tool.mutmut]`); `rm -rf mutants` before a rerun after test changes (spec 012 F-15). It works
  from a copy in `mutants/` (gitignored), so tests find repo files through `tests/paths.py`.

## UI check (spec 022)
- `pnpm --dir apps/dashboard ui:check --base http://127.0.0.1:<port> [paths…]` against a running
  dashboard (console paths under `/app/`): screenshots at 1280 and 390 px into `ui-check/`; fails
  on a page-level horizontal scroll, not exactly one h1, more than one primary button or intent
  plate, an axe-core serious/critical issue, or a console error. `apps/dashboard/package.json`
  exists only for this check (Playwright, axe-core).

## Other commands
- `uv run mudpuppy-glossary --write`: glossary sync. `mudpuppy-dashboard-smoke`: smoke tests.
  `pnpm --dir apps/dashboard cls:ci`: layout-shift check of every console route against its own
  seeded dashboard (spec 079; `cls:check` is the same measure against a running one).

## See also
- `LAYOUT.md`; specs/003-dashboard-ui (R-12), specs/004-ba-documentation (R-15),
  specs/006-glossary-ba-wiki (R-22), specs/071-r100-react-spa (R-100); docs/code-guidelines.md (G-15)
