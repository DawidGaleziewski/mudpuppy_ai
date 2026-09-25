---

description: "Task list for Dashboard UI (R-12)"
---

# Tasks: Dashboard UI

**Input**: Design documents from `specs/003-dashboard-ui/`

**Prerequisites**: plan.md, spec.md, research.md (§1-§9), data-model.md, contracts/http-routes.md,
contracts/ui-conventions.md, quickstart.md; constitution at `.specify/memory/constitution.md`.

**Tests**: The constitution (Principle VII, Development Workflow) requires tests for pure pieces
before dependent code builds on them. Here that means pytest for `models`, `queries` and `live`, and
route tests with a fixture store. Test tasks come first in each block and MUST fail before the
implementation task that follows.

**Organization**: Grouped by user story in priority order. US4 (frontend agent + skill) is placed
in Setup, not last: every UI task after it should be done by or with the `frontend-dev` agent
using the `revamp-dashboard` skill, so it must exist first. Its phase below only verifies it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1-US4, from spec.md
- **[FE]**: UI work — follows skill `revamp-dashboard` (`references/pathfinder-console.md`); owned by the `frontend-dev` subagent (`.claude/agents/frontend-dev.md`) for future changes
- **[GOV]**: repo-structure work — delegate to the `governor` subagent

## Path Conventions

`apps/dashboard/` is a uv project: package in `apps/dashboard/src/pathfinder_dashboard/`, tests in
`apps/dashboard/tests/`. Agent and skill in `.claude/`. Read-only input: `data/db/*.sqlite`,
`data/migrations/*.up.sql`.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Install the design-system skill: copy `user_input/ux-package/skills/revamp-dashboard/` to `.claude/skills/revamp-dashboard/` (SKILL.md + 4 references, byte-identical); add `.claude/skills/revamp-dashboard/references/pathfinder-console.md` with the product layer from `specs/003-dashboard-ui/contracts/ui-conventions.md` (identity, status language, accent mapping, live regions) plus the htmx conventions from `contracts/http-routes.md` (live region = `hx-get` + `hx-trigger="store-changed from:body"` + `hx-swap="outerHTML"`); add a one-line pointer to it in the skill's "Reference material" list
- [X] T002 Create `.claude/agents/frontend-dev.md` from `user_input/ux-package/agents/ux-dashboard-designer.md`, following skill `subagent-authoring` (Mode 1): name `frontend-dev`; description ≤50 words (builds and changes Pathfinder dashboard UI in `apps/dashboard` — Jinja templates, htmx, CSS on the Console tokens; not for backend queries, schema or specs); `tools: Read, Write, Edit, Glob, Grep, Bash, Skill`; `model: sonnet`; body ≤400 words: invoke skill `revamp-dashboard` and read `references/pathfinder-console.md` before any UI task, stack facts (server-rendered, htmx 4, tokens only in `static/css/tokens.css`), score against the scorecard before returning, return contract ≤15 lines. Run `python3 .claude/skills/subagent-authoring/scripts/lint_agent.py .claude/agents/frontend-dev.md --root .` and fix all errors
- [X] T003 Amend `.specify/memory/constitution.md` → Technical Constraints: add an "App layout" bullet (every app, whatever its language, lives in its own self-contained `apps/<name>/`; no language manifest at the repo root); the Python tooling bullet drops "under `python/`" and points at `apps/<name>/`; allow a read-only operator dashboard to read the store over a `mode=ro` connection with read models tested for drift. Bump 1.2.0 → 1.3.0 (MINOR, new bullet), update the Sync Impact Report and "Last Amended" to 2026-09-25
- [X] T004 [GOV] Scaffold `apps/dashboard/` with uv: `pyproject.toml` (name `pathfinder-dashboard`, `requires-python = ">=3.13"`, src layout, deps `fastapi`, `uvicorn[standard]`, `jinja2`, `pydantic`, `pydantic-settings`; dev group `pytest`, `httpx`, `ruff`; script `pathfinder-dashboard = "pathfinder_dashboard.__main__:main"`; ruff and pytest config), `uv.lock`, `src/pathfinder_dashboard/__init__.py`, `tests/`, `README.md`. No files at the repo root. Add `__pycache__/`, `.venv/`, `.ruff_cache/`, `.pytest_cache/` to root `.gitignore`. `uv sync && uv run pytest && uv run ruff check .` pass
- [X] T005 [P] Vendor front-end assets into `apps/dashboard/src/pathfinder_dashboard/static/`: `vendor/htmx.min.js` and `vendor/hx-sse.min.js` from `htmx.org@4.0.0` (jsdelivr `dist/` and `dist/ext/`; record exact URLs and sha256 in `static/vendor/README.md`), `fonts/JetBrainsMono-{Regular,Medium,Bold}.woff2` subset latin + latin-ext (OFL licence file alongside)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: read-only store access, read models, app shell and design tokens that every story uses.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T006 Test fixture builder in `apps/dashboard/tests/conftest.py`: `make_store(tmp_path, env="test")` applies `data/migrations/*.up.sql` in order to `tmp_path/db/<env>.sqlite` (WAL mode, like the crawler), plus a `seed(store, ...)` helper inserting runs/states/actions/frontier/decisions/forms/network/robots rows; a `liveinsurer_like` fixture reproducing the shape of the 2026-09-25 data (9 runs: 7 `interrupted`; 600 actions and 600 frontier items, one frontier item per extracted action, 2 `stopped_warning` with reCAPTCHA warnings; 1 state; frontier statuses 549/2/30/10/6/3; decision rules `ceiling:read` 30, `click_failed` 10, `robots:Disallow: *cHash*` 6)
- [X] T007 [P] Failing tests `apps/dashboard/tests/test_models_schema.py`: for every table in the fixture store, the matching model in `models.py` has exactly the columns of `PRAGMA table_info` in order; every Literal equals the table's CHECK enum (`runs.status` = `'running','completed','stopped_warning','interrupted'`; `frontier.status` = 8 values incl. `'robots_disallowed'`; `decision_log.kind` = `'skip','refuse','merge','split','warning','note'`; `safety_class` = `'read','mutating','destructive','external-side-effect'`; `confidence` = `'observed','inferred','needs_confirmation'`)
- [X] T008 [P] Failing tests `apps/dashboard/tests/test_readonly.py`: `db.connect()` opens with `mode=ro` and `query_only`; any INSERT/UPDATE/DELETE/CREATE raises; the fixture store's sha256 is identical before and after hitting every route; a missing store path raises `StoreMissing` and never creates a file
- [X] T009 Implement `apps/dashboard/src/pathfinder_dashboard/settings.py` (pydantic-settings: `data_dir` default = nearest ancestor containing `data/migrations`, env `PATHFINDER_DATA_DIR`; `host` fixed default `127.0.0.1`; `port` 8765; `dev: bool`) and `db.py` (`list_environments()` from `data/db/*.sqlite`, default `production`; `connect(env)` → `sqlite3` with `file:…?mode=ro` URI, `PRAGMA query_only=ON`, `busy_timeout=2000`, `row_factory`; `StoreMissing`; `data_version(conn)`; `store_info(env)`) per research §2, §7. T008 passes
- [X] T010 Implement `apps/dashboard/src/pathfinder_dashboard/models.py`: one Pydantic v2 model per table per data-model.md (JSON columns parsed to `JsonValue`, raw string kept when invalid; `allowed`/`truncated` as `bool`) and the view models `StoreInfo`, `PortalSummary`, `RunSummary`, `Page[T]`, `DecisionGroup`, `LiveEvent`. T007 passes
- [X] T011 [FE] Design tokens and primitives: `static/css/tokens.css` (every Console token from `console-design-system.md` as custom properties, plus status aliases from `pathfinder-console.md`, e.g. `--status-running: var(--accent-3)`; `@font-face` for the self-hosted font), `static/css/app.css` layered primitives → patterns (buttons, selects, focus ring, bracket status text, live dot with `prefers-reduced-motion` fallback, stat card, data table + mobile stacked cards, underline tabs, nav bar, pagination ticks, empty/loading caret/error/not-found states, stale banner, scanline background). Add test `apps/dashboard/tests/test_tokens.py`: `app.css` contains no hex/rgb colour literals and no `border-radius` other than `var(--radius-*)`
- [X] T012 [FE] App shell: `app.py` (`create_app(settings)` factory, Jinja env with autoescape, static mount with cache headers, `no-store` on HTML, `env` query param resolved on every request, exception handler for `StoreMissing` → error-state page), `templates/base.html` (nav with `pathfinder://console` wordmark and mark, environment dropdown, `hx-sse:connect="/events"` on `<body>`, stale banner slot, scripts deferred), `templates/partials/states/{empty,error,not_found}.html`, `__main__.py` (`main()` with argparse `--env`, `--port`, `--dev`; runs uvicorn on `settings.host`, `reload=True` + `reload_includes` in dev). `/healthz` per contracts/http-routes.md. Route smoke test in `tests/test_routes.py`

**Checkpoint**: `uv run pathfinder-dashboard` serves an empty shell on 127.0.0.1:8765 against the real store.

---

## Phase 3: User Story 1 - See what has been recorded so far (Priority: P1) 🎯 MVP

**Goal**: overview per portal and a runs table, matching the store.

**Independent Test**: open `/` against the fixture store `liveinsurer_like` and against `data/db/production.sqlite`; counts match direct SQL; the 2 `[STOP]` rows show their warning.

- [X] T013 [P] [US1] Failing tests in `apps/dashboard/tests/test_queries.py`: `portal_summaries(conn)` on `liveinsurer_like` returns one `liveinsurer` summary with `runs_by_status == {"interrupted": 7, "stopped_warning": 2}` and totals equal to direct `COUNT(*)` queries; `list_runs(conn, portal=None, status=None, cursor=None, limit=50)` is newest first by `started_at`, filters by portal and status, keyset-paginates on `id`; `duration_ms` = `ended_at − started_at`, or `elapsed_ms` while `running`; empty store → `[]`
- [X] T014 [US1] Implement `portal_summaries` and `list_runs` in `apps/dashboard/src/pathfinder_dashboard/queries.py` (pure: connection in, models out; parameterised SQL only). T013 passes
- [X] T015 [P] [US1] Failing route tests in `apps/dashboard/tests/test_routes.py`: `GET /` shows `liveinsurer`, `9` runs, `[INT.]` ×7 and `[STOP]` ×2 with the reCAPTCHA warning text; `GET /fragments/runs?status=stopped_warning` returns only those 2 rows; empty store → empty-state text "No runs recorded yet" with the start-a-run hint; missing store → error state naming the path; a portal title containing `<script>` is rendered escaped
- [X] T016 [US1] [FE] Routes `/`, `/fragments/summary`, `/fragments/runs` in `app.py`; templates `overview.html`, `partials/portal_cards.html` (stat cards: runs by status, states, actions allowed/skipped, forms, network calls, open questions, rule candidates), `partials/runs_table.html` (columns portal, persona, mode, environment, status, steps, started, duration, warning; each row links to `/runs/{id}`; portal + status filter selects with `hx-get` + `hx-push-url`; pagination ticks). Status labels from one Jinja macro `partials/macros.html` implementing the status table in `contracts/ui-conventions.md`. Both fragments are live regions. T015 passes

**Checkpoint**: MVP. The operator sees every run and how it ended without SQL (SC-001).

---

## Phase 4: User Story 2 - Inspect one run in detail (Priority: P2)

**Goal**: run detail with all sections, evidence and confidence shown, in-place filters.

**Independent Test**: open the fixture run with frontier and decisions; each section's counts match SQL; decision filter by kind works without full reload and survives reload via URL.

- [X] T017 [P] [US2] Failing tests in `apps/dashboard/tests/test_queries.py`: `get_run(conn, id)` (None when absent), `run_summary(conn, id)` counts per section; `run_states` (via `state_observations` join; each has `confidence` and `evidence_ref`); `run_actions(conn, id, safety_class, allowed, cursor)`; `frontier_counts` + `run_frontier(conn, id, status, cursor)`; `run_forms`, `run_network_calls`, `run_robots_policies`; `decision_groups(conn, id)` → `(kind, rule, count, example_reason)` ordered by count desc, and `run_decisions(conn, id, kind, rule, cursor)`; all paginated lists 50/page keyset on `id`; invalid JSON in `action_json`/`detail_json` is returned raw, not raised
- [X] T018 [US2] Implement the run-detail query functions in `apps/dashboard/src/pathfinder_dashboard/queries.py`. T017 passes
- [X] T019 [P] [US2] Failing route tests in `apps/dashboard/tests/test_routes.py`: `GET /runs/{id}` shows header (status label, warning, steps, duration, config snapshot collapsed as escaped `<pre>`) and 7 section tabs with counts; every state row shows its confidence text and `evidence_ref`; `GET /fragments/runs/{id}/decisions?kind=skip` returns only skip entries and `?rule=ceiling:read` only that rule; `?cursor=` returns the next page; unknown id → 404 with the not-found state
- [X] T020 [US2] [FE] Routes `/runs/{run_id}` and the 8 `/fragments/runs/{run_id}/…` fragments in `app.py`; templates `run_detail.html` (underline tabs, one panel per section, keyboard-operable tablist), `partials/run_header.html`, `states.html`, `actions.html` (safety-class accent + text per ui-conventions, allowed/skip_reason), `frontier.html` (counts by status + table, `pending` rows dashed), `forms.html` (fields list), `network.html` (method, url_template, status, schema shapes collapsed), `robots.html`, `decisions.html` (grouped counts + filterable entries). Every region is a live region; filters use `hx-push-url`. T019 passes

**Checkpoint**: US1 + US2 cover "what happened and why" per run.

---

## Phase 5: User Story 3 - Watch the data change live (Priority: P3)

**Goal**: open pages follow the store within 3 s; dev reload; stale banner.

**Independent Test**: with a page open on a scratch store, insert a run; it appears in ≤3 s with no reload.

- [X] T021 [P] [US3] Failing tests `apps/dashboard/tests/test_live.py`: `watch(env, interval=0.05)` async generator yields `hello` (with `boot_id`, `data_version`, `dev`, `retry=2000`) first; after another connection commits to the store it yields `store-changed` with the new `data_version` within 3 intervals; no event when nothing changed; a `: ping` comment after the keep-alive interval; `GET /events` responds `text/event-stream`
- [X] T022 [US3] Implement `apps/dashboard/src/pathfinder_dashboard/live.py` (`watch()` polling `PRAGMA data_version` on its own read-only connection, per research §3; process-wide `BOOT_ID`) and `GET /events` in `app.py` with `fastapi.sse.EventSourceResponse` / `ServerSentEvent`. T021 passes
- [X] T023 [US3] [FE] `static/js/live.js` (≤40 lines, no framework): on `hx-sse` error/close show the stale banner (`role="status"`), hide on reopen; in dev mode (`data-dev` on `<body>`) remember the first `boot_id` from `hello` and `location.reload()` when a later `hello` differs. Live dot on `[RUN.]` rows only. Manual check of quickstart scenarios 4-6 recorded in `apps/dashboard/README.md`

**Checkpoint**: SC-003 met; FR-014 dev reload works.

---

## Phase 6: User Story 4 - A frontend role that applies the design system (Priority: P4)

**Goal**: the `frontend-dev` agent and `revamp-dashboard` skill (built in T001-T002) are verified in use.

**Independent Test**: quickstart scenario 9.

- [X] T024 [US4] Dry-run `frontend-dev` on a read-only question ("how would you add an open-questions panel to run detail?"); confirm its answer loads `revamp-dashboard` + `pathfinder-console.md`, uses tokens and the live-region pattern, and ends with a scorecard; fix the agent body if not. Record the result in `specs/003-dashboard-ui/checklists/requirements.md` Notes

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T025 [P] Performance check (SC-005): `apps/dashboard/tests/test_perf.py` seeds a store with 10 000 frontier items, 10 000 actions and 2 000 decisions in one run and asserts `/`, `/runs/{id}` and each fragment render in < 1 s with `TestClient`. If `actions` or `decision_log` counts are too slow without a `run_id` index, do not add one here: report to `db-admin` with the measurement (research §8)
- [X] T026 [P] [FE] Score the dashboard against `.claude/skills/revamp-dashboard/references/good-practices-scorecard.md` at 375px, 768px and 1280px (screenshots of overview, run detail, empty, error and not-found states into `specs/003-dashboard-ui/checklists/scorecard.md`, with an honest score per category and gaps listed). Contrast of every token pairing used checked against WCAG AA
- [X] T027 [P] `apps/dashboard/README.md`: run, dev mode, env selection, data dir, read-only guarantee, how live updates work, where the design system lives and that UI work goes to `frontend-dev`. Link it from the root `README.md`
- [X] T028 Run quickstart.md scenarios 1-9 against `data/db/production.sqlite` (read-only) and a scratch copy; record results in `specs/003-dashboard-ui/checklists/requirements.md` Notes
- [X] T029 `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .` in `apps/dashboard/`; the crawler suite (`pnpm -C apps/crawler test`) still passes

---

## Dependencies & Execution Order

- **Setup (T001-T005)**: T001 → T002 (agent points at the skill). T003, T004 independent; T005 after T004.
- **Foundational (T006-T012)**: after T004. T006 before T007/T008; T009 after T008; T010 after T007; T011 after T001 + T005; T012 after T009-T011.
- **US1 (T013-T016)**: after Foundational. MVP.
- **US2 (T017-T020)**: after Foundational; reuses US1's macros (T016) for status labels.
- **US3 (T021-T023)**: after Foundational; its live regions are only visible once US1/US2 templates exist, but `live.py` and `/events` are independent.
- **US4 (T024)**: after T002 and at least T016.
- **Polish (T025-T029)**: after the stories they check.

### Parallel opportunities

- T003, T004 in parallel; T005 alongside T006-T008.
- T007 ∥ T008; T013 ∥ T015; T017 ∥ T019; T021 alongside any US1/US2 work.
- T025 ∥ T026 ∥ T027.

## Implementation Strategy

1. Setup + Foundational → shell running on the real store.
2. US1 → **stop and validate** (MVP: the user sees the liveinsurer runs and why they stopped).
3. US2 → run detail. 4. US3 → live. 5. US4 verify + Polish.
6. Close R-12 through `po` once every task is `[X]`.
