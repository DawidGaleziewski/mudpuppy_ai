# pathfinder-dashboard

Read-only operator dashboard over the crawler's SQLite store, showing portals, runs, states, actions, safety class, frontier, forms, network shapes, robots.txt, decision log. Docs tab shows BA agent's documentation (SRS view). Glossary tab explains MudPuppy terms.

Layer: app (Python, FastAPI + Jinja + htmx, uv; outside the TS layers)

## Run
- `cd apps/dashboard && uv sync && uv run pathfinder-dashboard` → http://127.0.0.1:8765.
- Dev mode: `uv run pathfinder-dashboard --dev`.
- Env: `PATHFINDER_DATA_DIR`, `PATHFINDER_DEFAULT_ENV`, `PATHFINDER_PORT`, `PATHFINDER_DEV`; chat service URL `PATHFINDER_CHAT_URL` (see README).

## Layout
- `app.py`: only builds the app (settings, templates and filters, the `Web` object, the portal
  cookie middleware, static files, `include_router` calls in a fixed order).
- `web/deps.py`: `Ctx`, `build_url`, `Web` (`ctx`, `render`, `missing`, `not_found`, glossary) on
  `app.state.web`; routers call `web_of(request)`.
- `web/<page>.py`: one `APIRouter` per page with its fragments (`overview`, `runs`, `states`,
  `evidence`, `health`, `activity`, `docs`, `glossary`, `chat`, `portals`, `amendments`, `events`);
  shared view helpers in `web/views_docs.py`, `web/views_chat.py`, `web/chat_forward.py`.
- `queries.py`, `queries_docs.py`, `queries_chat.py`, `queries_urls.py` (visits, parameter
  inventory, spec 019): read models.
- `stores.py`: the stores a request may open (main data dir + eval workspaces), chosen by key.
- `models.py`: read-only models of SQLite schema; drift test vs. `data/schema/schema.sql`.
- `templates/`, `static/`, `diagrams.py`, `glossary.py`, `live.py`, `chat_client.py`.

## Invariants
- Reads DB read-only (test_readonly), except chat/amendment writes through chat service.
- No SQL in routers (G-15); a router never imports another router (G-13).
- UI follows the Salvage Yard design system (spec 022): all UI work uses the `mudpuppy-salvage-ui`
  skill; reference screens in `docs/design/salvage-yard/screens/`. Never use Console-era styling
  (amber `#FFB000`, JetBrains Mono, scanlines, glow, round status dots, bracket statuses like
  `[ OK ]`, the `mudpuppy://console` wordmark) in a migrated page. Until the clean-up (spec 022
  M6) unmigrated pages keep the Console base; `PATHFINDER_UI_SALVAGE` picks the base per route,
  never both stylesheets on one page.
- Compose from `sy-` classes; product-only layout classes use `mp-`. No hex, fonts, radius or
  shadows in templates or app CSS. Statuses through the one status helper, record ids through the
  tag helper, human text through the note helper. At most one primary button and one intent plate
  per view. Ask the owner before adding a colour, font, radius, shadow or animation.

## Where to add things
- New page: G-15 — `web/<page>.py` router (follow `web/glossary.py`), included in `app.py`,
  its template, queries in a `queries_*.py` module, a route test.

## Tests
- `uv run ruff check && uv run pytest -n auto -m 'not perf' && uv run pytest -m perf` (pytest-xdist,
  about 40 s; the `perf` wall-clock tests run alone; serial everything about 1 min 48 s).
- Complexity: `uv run ruff check --select C901,PLR0912,PLR0913,PLR0915 --exit-zero`.
- Mutation testing, on demand only (G-32): `uv run mutmut run` (about 30 s; mutates `diagrams.py`,
  `glossary.py`, `visuals.py` per `[tool.mutmut]`), then `uv run mutmut results` and
  `uv run mutmut show <name>`. Only the test files in `pytest_add_cli_args_test_selection` run:
  add a new test file of a mutated module there, and `rm -rf mutants` before a rerun after test
  changes (spec 012 F-15). Works from a copy in `mutants/` (gitignored), so tests find repo
  files through `tests/paths.py`, never by counting parent folders.

## UI check (spec 022)
- `pnpm --dir apps/dashboard ui:check --base http://127.0.0.1:<port> [paths…]` against a running
  dashboard with `PATHFINDER_UI_SALVAGE=all`: screenshots at 1280 and 390 px (reduced motion) into
  `ui-check/`, and fails on a page-level horizontal scroll, not exactly one h1, more than one
  primary button or intent plate, an axe-core serious/critical issue, or a console error.
  `apps/dashboard/package.json` exists only for this check (Playwright, axe-core).

## Other commands
- `uv run pathfinder-glossary --write`: glossary sync.
- `pathfinder-dashboard-smoke`: smoke tests.

## See also
- specs/003-dashboard-ui (R-12), specs/004-ba-documentation (R-15), specs/006-glossary-ba-wiki (R-22)
- docs/code-guidelines.md (G-15)
