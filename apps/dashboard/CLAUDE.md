# mudpuppy-dashboard

Read-only operator dashboard over the crawler's SQLite store, showing portals, runs, states, actions, safety class, frontier, forms, network shapes, robots.txt, decision log. Docs tab shows BA agent's documentation (SRS view). Glossary tab explains MudPuppy terms.

Layer: app (Python, FastAPI + Jinja + htmx, uv; outside the TS layers)

## Run
- `cd apps/dashboard && uv sync && uv run mudpuppy-dashboard` → http://127.0.0.1:8765.
- Dev mode: `uv run mudpuppy-dashboard --dev`.
- Env: `MUDPUPPY_DATA_DIR`, `MUDPUPPY_DEFAULT_ENV`, `MUDPUPPY_PORT`, `MUDPUPPY_DEV`; chat service URL `MUDPUPPY_CHAT_URL` (see README).
- Workbench beta (spec 043): `MUDPUPPY_WORKBENCH=1` shows it; `MUDPUPPY_WORKBENCH_MODEL=0`
  turns the assistant off (live views stay), `MUDPUPPY_WORKBENCH_COMMANDS=0` pauses the cards.

## Layout
- `app.py` only builds the app; `web/deps.py` holds `Ctx` and `Web` (`web_of(request)`);
  `web/<page>.py` is one `APIRouter` per page with its fragments; a page's query is one Pydantic
  model (`Annotated[Model, Query()]`).
- `queries*.py`: the read models, one module per page or concept; `models.py`: read-only models
  of the schema (drift test vs. `data/schema/schema.sql`).
- Writes go through the chat service (`chat_client.py`); `as_of.py` serves past model versions.
- **Where each page and read model lives, by spec: `LAYOUT.md`.** Read it before changing a page.

## Invariants
- Reads DB read-only (test_readonly), except chat/amendment writes through chat service.
- No SQL in routers (G-15); a router never imports another router (G-13).
- UI follows the Salvage Yard design system (spec 022): all UI work uses the `mudpuppy-salvage-ui`
  skill; reference screens in `docs/design/salvage-yard/screens/`. Never use Console-era styling
  (amber `#FFB000`, JetBrains Mono, scanlines, glow, round status dots, bracket statuses like
  `[ OK ]`, the `mudpuppy://console` wordmark). Every template lives under `templates/salvage/`;
  routers name them without the prefix (`web/deps.py` `salvage_template`).
  `scripts/find-old-styles.sh src` must report 0.
- Compose from `sy-` classes; product-only layout classes use `mp-`. No hex, fonts, radius or
  shadows in templates or app CSS. Statuses through the one status helper, record ids through the
  tag helper, human text through the note helper. At most one primary button and one intent plate
  per view. Ask the owner before adding a colour, font, radius, shadow or animation.

## Where to add things
- New page: G-15 — `web/<page>.py` router (follow `web/glossary.py`), included in `app.py`,
  its template, queries in a `queries_*.py` module, a route test, a line in `LAYOUT.md`.

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
  dashboard: screenshots at 1280 and 390 px into `ui-check/`; fails on a page-level horizontal
  scroll, not exactly one h1, more than one primary button or intent plate, an axe-core
  serious/critical issue, or a console error. `apps/dashboard/package.json` exists only for this
  check (Playwright, axe-core).

## Other commands
- `uv run mudpuppy-glossary --write`: glossary sync. `mudpuppy-dashboard-smoke`: smoke tests.

## See also
- `LAYOUT.md`; specs/003-dashboard-ui (R-12), specs/004-ba-documentation (R-15),
  specs/006-glossary-ba-wiki (R-22); docs/code-guidelines.md (G-15)
