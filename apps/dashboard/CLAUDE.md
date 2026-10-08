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
- `queries.py`, `queries_docs.py`, `queries_chat.py`: read models.
- `models.py`: read-only models of SQLite schema; drift test vs. `data/schema/schema.sql`.
- `templates/`, `static/`, `diagrams.py`, `glossary.py`, `live.py`, `chat_client.py`.

## Invariants
- Reads DB read-only (test_readonly), except chat/amendment writes through chat service.
- No SQL in routers (G-15); a router never imports another router (G-13).
- UI follows Console design tokens.

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

## Other commands
- `uv run pathfinder-glossary --write`: glossary sync.
- `pathfinder-dashboard-smoke`: smoke tests.

## See also
- specs/003-dashboard-ui (R-12), specs/004-ba-documentation (R-15), specs/006-glossary-ba-wiki (R-22)
- docs/code-guidelines.md (G-15)
