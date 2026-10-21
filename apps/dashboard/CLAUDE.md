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
  `app.state.web`; routers call `web_of(request)`. `Ctx.url` adds `portal=` to links to things
  named by a per-portal key (`/processes/…`, a selected Review item; spec 029).
- `web/<page>.py`: one `APIRouter` per page with its fragments (`overview`, `runs`, `states`,
  `evidence`, `health`, `activity`, `docs`, `glossary`, `chat`, `portals`, `amendments`, `events`,
  and for spec 022 `processes`, `review`, `scans`, `screens`, for spec 024 `access`);
  shared view helpers in `web/views_docs.py`, `web/views_chat.py`, `web/chat_forward.py`,
  `web/views_access.py` (the /access matrix and the screen page's Access tab with its side by
  side, `partials/state_access_compare.html`; Review's "Unexplained differences" group comes from
  `queries_access.unexplained`, spec 024 P2).
- `queries.py`, `queries_docs.py`, `queries_chat.py`, `queries_urls.py` (visits, parameter
  inventory, spec 019), and for spec 022 `queries_screens.py`, `queries_revisions.py`,
  `queries_proposals.py` (the assistant's proposals), `queries_processes.py` (BA processes,
  history, compare), `queries_access.py` (which personas see which screen and element, spec 024;
  the same model as the BA tool `get_access_matrix`, both checked against
  `apps/crawler/tests/fixtures/access/three-personas.json`), `queries_review.py` (records, assumptions to check, unexplained differences, re-anchoring,
  proposals, probe suites), `queries_suites.py` (spec 032: open probe suites for Review, and a
  state's form step with its states and probe outcomes for the screen page), `queries_scans.py`, `queries_settings.py`, `queries_home.py` (Home beside the
  assistant): read models. Spec 033: `map_layout.py` (pure layout of Scans ▸ Map: discovery tree,
  layers, families), `queries_map.py` + `queries_map_node.py` (nodes, edges, inspector),
  `web/map.py` + `static/js/map.js`.
- `stores.py`: the stores a request may open (main data dir + eval workspaces), chosen by key;
  `portals_in` (cached per file write) backs the header's store menu, which lists the stores
  holding the chosen portal, and the portal menu's links, which land on such a store (R-71).
- Spec 034 (R-71): `pager.py` (25 a page, `paginate` / `paged_from_count`, the `sy.pages`
  macro) on Screens (`?q=` filter), scan history, Review group tabs, Processes; keyset lists
  use `settings.page_size` = 25. `neighbours.py`: Prev / Next on screen and record pages from
  the `list=` link the list adds (Screens, Docs sections, a scan's states); Review's side pane
  walks the selected item's group. R-70: `queries_run_groups.py` + `web/run_groups.py`
  (Scans ▸ By process: scans per documented process, unassigned, proposed groups; the same model
  as the BA server's `run-groups.ts`, both checked against
  `apps/crawler/tests/fixtures/run-groups/cases.json`). R-66: the map inspector sets Start here,
  Focus, Recheck, Retry and Skip (`web/states.py` `/states/{id}/mark`, through the chat service);
  `web/plan.py` + `queries_plan.py`: Scans ▸ Plan next scan (screen 14; Start scan posts one
  precise `request_scan` request to the portal's conversation) and `/scans/recover/{run}` (screen
  15: Resume, Retry this path with a variation, Skip it, attempts). R-68: `process_export.py` runs
  `pnpm docs:process-export` into a temp folder (kept until the store changes) and renders it
  without raw HTML; `web/process_export.py`: `/docs/{portal}/{PROC}/export` and
  `/processes/{PRC}/export` (one tab per file, images, `openapi.yaml`/`process.json`, zip).
- Spec 035 (R-74): `queries_run_graph.py` + `partials/graph.html`: a scan's Graph tab (its
  screens and moves in the map's layout, failures and the stop screen, path, Resume, Retry /
  Skip / Start here per screen); a scan that stopped or failed opens on it. Forms posted with
  `from=graph` (or a `/runs/…` mark `back`) return to the graph.
- Spec 027 (R-54, processes as-is first): `queries_process_doc.py` (pictures per screen, A per
  step with the records citing its screen, what is still open, the sign-off) and
  `partials/picture.html` + `static/js/pictures.js` (thumbnail → picture dialog). The process
  page leads with A as documentation until `to_be_design`; A is edited by screens (forwarded to
  `…/models/A/edit`), processes are archived (`?show=archived` lists them), a PROC record has
  Open in Processes (`…/processes/from-record`). Archived processes' screens count as loose.
- Spec 039 (T100, the designer's 2.0 pages): `nav.py` groups the sections (Home · Changes · Review
  | Portal model: Processes · Screens · Rules · Docs | Machine: Scans · Settings);
  `queries_rules.py` + `web/rules.py` (Rules, v2-11 / v2-12: decision tables, boundary tests,
  history; read-only); `queries_model_facts.py` + `partials/model_facts.html` (a process page's
  "In the portal model": triggers incl. deep links, outcomes, explored, rules).
  `queries_changes.py` + `web/changes.py` (Changes, v2-02: a range of model versions, grouped by
  process and screen, explanations in the UI's words) and `queries_change_detail.py` +
  `change.html` (Before / after, v2-03; `static/js/change-keys.js`); `queries_releases.py` +
  `partials/releases.html` (release lanes from the latest model version's build epochs, scans,
  range bracket). Review (v2-04 / v2-05 / v2-16): `queries_queue.py` (Findings, Rules, Removals,
  Processes ahead of `queries_review`'s kinds; Explained automatically and Decided tabs,
  `?tab=`), `partials/review_queue_item.html`; deciding posts `/review/hypotheses/{portal}` →
  the chat service's `POST /portals/{p}/model/decide`. A process's A and
  B are process models (`?model=B`, status vocabulary `process_model`; owner answer 8).
- `servers.py`: live `pathfinder` servers read from `<data_dir>/servers/*.json`; the header names
  those on another environment or checkout (spec 031 R-61). Read-only, dead files are skipped.
- `models.py`: read-only models of SQLite schema; drift test vs. `data/schema/schema.sql`.
- `templates/`, `static/`, `diagrams.py`, `glossary.py`, `live.py`, `chat_client.py`.

## Invariants
- Reads DB read-only (test_readonly), except chat/amendment writes through chat service.
- No SQL in routers (G-15); a router never imports another router (G-13).
- UI follows the Salvage Yard design system (spec 022): all UI work uses the `mudpuppy-salvage-ui`
  skill; reference screens in `docs/design/salvage-yard/screens/`. Never use Console-era styling
  (amber `#FFB000`, JetBrains Mono, scanlines, glow, round status dots, bracket statuses like
  `[ OK ]`, the `mudpuppy://console` wordmark). Since the clean-up (spec 022 M6) every template
  lives under `templates/salvage/`; routers may name them without the prefix (`web/deps.py`
  `salvage_template`). `scripts/find-old-styles.sh src` must report 0.
- Compose from `sy-` classes; product-only layout classes use `mp-`. No hex, fonts, radius or
  shadows in templates or app CSS. Statuses through the one status helper, record ids through the
  tag helper, human text through the note helper. At most one primary button and one intent plate
  per view. Ask the owner before adding a colour, font, radius, shadow or animation.

## Where to add things
- New page: G-15 — `web/<page>.py` router (follow `web/glossary.py`), included in `app.py`,
  its template, queries in a `queries_*.py` module, a route test.

## Tests
- `uv run ruff check && uv run pytest -n auto -m 'not perf and not serial' && uv run pytest -m 'perf or serial'`
  (pytest-xdist, about 40 s; the `perf` wall-clock tests and the load-sensitive `serial` tests run
  alone; serial everything about 1 min 48 s).
- Complexity: `uv run ruff check --select C901,PLR0912,PLR0913,PLR0915 --exit-zero`.
- Mutation testing, on demand only (G-32): `uv run mutmut run` (about 30 s; mutates `diagrams.py`,
  `glossary.py`, `visuals.py` per `[tool.mutmut]`), then `uv run mutmut results` and
  `uv run mutmut show <name>`. Only the test files in `pytest_add_cli_args_test_selection` run:
  add a new test file of a mutated module there, and `rm -rf mutants` before a rerun after test
  changes (spec 012 F-15). Works from a copy in `mutants/` (gitignored), so tests find repo
  files through `tests/paths.py`, never by counting parent folders.

## UI check (spec 022)
- `pnpm --dir apps/dashboard ui:check --base http://127.0.0.1:<port> [paths…]` against a running
  dashboard: screenshots at 1280 and 390 px (reduced motion) into
  `ui-check/`, and fails on a page-level horizontal scroll, not exactly one h1, more than one
  primary button or intent plate, an axe-core serious/critical issue, or a console error.
  `apps/dashboard/package.json` exists only for this check (Playwright, axe-core).

## Other commands
- `uv run pathfinder-glossary --write`: glossary sync.
- `pathfinder-dashboard-smoke`: smoke tests.

## See also
- specs/003-dashboard-ui (R-12), specs/004-ba-documentation (R-15), specs/006-glossary-ba-wiki (R-22)
- docs/code-guidelines.md (G-15)
