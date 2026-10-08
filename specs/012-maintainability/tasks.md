# Tasks: Maintainability (spec 012, R-34)

**Input**: `specs/012-maintainability/` (spec.md, plan.md, research.md, data-model.md, contracts/,
quickstart.md). Branch `feature/012-r34-maintainability`.

**Tests**: no new feature tests beyond what the spec requires (golden behaviour lock, boundary
test, tier checks); the existing suites are the safety net. Every task ends with its tier green.

**Model tags** (research R15): `[opus]` judgment and subtle code, and the review of every
`[sonnet]`/`[haiku]` result; `[sonnet]` code-touching but well-specified; `[haiku]` very
mechanical edits with an exact list. Sonnet/Haiku run as background subagents from a brief that
names the exact files to touch and to format; they do not commit. Opus reviews, runs the checks
and commits per task group with the task ids in the message.

**Rules for every task**: behaviour unchanged; one file (or one layer) per commit; Edit tool only,
then re-read (CLAUDE.md, no sed/Python edits); log every bug or slip in `findings.md` with a
test/eval idea.

Format: `- [ ] Tnnn [P?] [USn?] [model] description with paths`

---

## Phase 1: Setup

- [x] T001 [haiku] Create `specs/012-maintainability/findings.md` (same shape as
  `specs/010-acp-chat-orchestrator/findings.md`: `## F-nn title`, what happened, fix, test/eval
  idea) with a "Baseline" section copying the spec's baseline table and the commit `1b4b0ac`.
- [x] T002 [opus] Verify the fast-tier mechanism in `apps/crawler/vitest.config.ts` (root
  `test.projects: ['packages/*']`): does `vitest run --changed` work across projects and packages
  (change a line in `packages/fingerprint/src/`, list the files it selects with
  `--changed --reporter=verbose`)? Choose how the fast tier excludes `**/*.e2e.test.ts` and the
  `gates` project (CLI `--exclude` + project negation, or a separate
  `apps/crawler/vitest.fast.config.ts`). Record the result under research R1 ("verified").

---

## Phase 2: User Story 1 - Fast feedback on every commit (P1) 🎯 MVP

**Goal**: commit checks run only affected fast tests; browser end-to-end tests and gates run in
the slow tier and in the close-out.

**Independent test**: quickstart §1 (SC-001: leaf-package commit check < 60 s; SC-002: slow tier
≥ 30 % below 5 min 40 s).

- [x] T003 [haiku] [US1] Rename the browser end-to-end files of `apps/crawler/packages/mcp-server/tests/`
  to `*.e2e.test.ts` with `git mv`: `insurer-run`, `map-run`, `trace-map-run`, `workspaces`,
  `capture`, `trace-run`, `trace-failure`, `pw-trace`, `pii-scrub`, `autofill`, `run-choices`,
  `shutdown` (12 files; they drive whole runs through the MCP harness with Chromium). The
  `crawler` and `obstacles` browser unit tests stay in the fast tier (about 9 s together). No
  content change; update any path that names them (grep the repo for each old file name,
  including `specs/` docs only where they describe current layout — leave history as is).
- [x] T004 [opus] [US1] Add the tier scripts to `apps/crawler/package.json`: `test:fast`
  (mechanism from T002, prints `tier: fast (affected)` or `tier: fast (full: <trigger>)`),
  `test:slow` (`**/*.e2e.test.ts` + `gates` project, prints `tier: slow`); `test` unchanged (all).
  Add `forceRerunTriggers` in `apps/crawler/vitest.config.ts` (and the fast config if any) for:
  `**/tests/**/harness.ts`, `**/tests/**/*-harness.ts`, `**/tests/**/mock-*.ts`,
  `**/tests/**/helpers.ts`, `**/tests/**/shared-pages.ts`, `**/tests/**/fixtures/**`,
  `../../data/migrations/**`, `../../portals/**`, `../../personas/**`, `**/tsconfig*.json`,
  `eslint.config.mjs`, plus Vitest's defaults. Contract: `contracts/test-commands.md`.
- [x] T005 [P] [sonnet] [US1] Split `apps/crawler/packages/mcp-server/tests/insurer-run.e2e.test.ts`
  (10 tests, 209 s) into `insurer-robots.e2e.test.ts` (robots: consecutive runs, direct navigate
  refused, `allow_and_record`, robots 404), `insurer-safety.e2e.test.ts` (sessionId denylist,
  purchase/submit refusals, portal rule + German keyword) and `insurer-mapping.e2e.test.ts`
  (read-only map with evidence, 403 stop, resume without duplicates); move the shared
  `insurerYaml`/`insurer()` set-up into `tests/insurer-harness.ts`. In the robots test change
  `for (let i = 0; i < 5; i++)` to 2 runs and `expect(mock.hits('/robots.txt').length).toBe(5)` to
  `toBe(2)`; keep every other assertion. Test count stays 10. The mock listens on an ephemeral
  port, so the files may run in parallel.
  **State 2026-10-07**: split written and green (12 tests: the `it.each` over 503/loop counts
  2, so the original file had 12, not 10), but **uncommitted**: deleting the old
  `insurer-run.e2e.test.ts` was denied by the permission classifier for the agent (F-04); waits
  for the user's `git rm`. **2026-10-08**: the user let Opus do it; old file removed, split
  committed (3 files, 12 tests, 95 s together).
- [x] T006 [opus] [US1] Review T005; run `pnpm test:slow` three times, record wall times and the
  slowest files in `findings.md`; if SC-002 (≥ 30 % below 340 s) is not met, find the next longest
  file (`map-run` 65 s) and split it the same way.
- [x] T007 [opus] [US1] Update `.claude/hooks/pre-commit-check.sh`: the crawler branch runs
  `pnpm --silent typecheck && pnpm --silent lint && pnpm --silent test:fast` and prints
  `pre-commit: crawler (fast tier)`; other branches unchanged; docs-only commits still run nothing.
  Check by committing a one-line fingerprint change on a scratch branch (time it, SC-001) and
  reverting.
- [x] T008 [P] [sonnet] [US1] Dashboard parallel tests: add `pytest-xdist` to the dev group in
  `apps/dashboard/pyproject.toml`, run `uv run pytest -n auto`; give tests that collide on a shared
  fixture store a per-worker copy (in `apps/dashboard/tests/conftest.py`); record serial vs parallel
  wall time in `findings.md`. If it is not faster or not stable over three runs, revert and log why.
- [x] T009 [haiku] [US1] Rewrite CLAUDE.md "Verification Before Commit": fast tier on every commit
  (`pnpm typecheck && pnpm lint && pnpm test:fast`; dashboard `uv run ruff check && uv run pytest`
  (with `-n auto` if T008 kept it)); `pnpm test:slow` before committing a task that changes
  `apps/crawler/packages/mcp-server/src/runtime/**`, `apps/crawler/packages/gates/**`,
  `apps/crawler/packages/crawler/src/**` or `apps/proving-ground/**`; `pnpm test` (all) and every
  app's suite in the close-out before merge. Keep the ports note and the other bullets. Exact
  text given by Opus in the brief.
- [x] T010 [opus] [US1] Checkpoint: quickstart §1 steps 1–5 on this branch; record the numbers
  (fast tier for a fingerprint change, a trigger change, slow tier, full) in `findings.md`.
  Commit group T001–T010.

---

## Phase 3: User Story 2 - Written code guidelines the user has rated (P1)

**Goal**: `docs/code-guidelines.md` with only user-rated rules; agent notes in every package.

**Independent test**: quickstart §2 (SC-009).

- [x] T011 [opus] [US2] Write the proposal list (about 25–35 items) in
  `specs/012-maintainability/guideline-proposals.md`, grouped: size limits (file 400, function
  80, complexity 15, params 5, depth 4 — research R9), layering (the four layers of research R6 and
  the open choices: `chat-model` vs `packages/workflow`, tracer placement), patterns for adding an
  MCP tool, a dashboard route/page, a schema + migration, a gate case; naming; comments (spec ids in
  comments yes/no); tests (tier per kind, fixtures, no `waitForTimeout`); lint (typed rules,
  which `no-unsafe-*` rules start as warnings); the agent-notes template (`contracts/agent-notes.md`);
  the close-out review. Each item: id, rule, why, how checked.
- [x] T012 [sonnet] [US2] Publish a rating page for the proposals (per the `propose-then-rate`
  practice used for R-22's term review): per item accept / amend (with note) / reject, a shared
  store so the ratings persist, and a "copy as text" fallback. Load the `artifact-design` and
  `artifact-capabilities` skills first. Give the user the link.
  Done 2026-10-07: https://claude.ai/artifact/MLAqcCCC4guxRR5PQJmezT (32 items G-01–G-32, ratings
  in the page's `ratings` collection, one doc per item id: `rating`, `note`, `updated_at`).
- [x] T013 [opus] [US2] After the user has rated: fold the ratings into
  `specs/012-maintainability/guideline-review.md` (item, rating, note), write accepted and amended
  items to `docs/code-guidelines.md` (format: data-model.md "Code guideline": `id`, `rule`, `why`,
  `checked by`, `rating`), update `contracts/agent-notes.md`, `contracts/layers.md` and research R6/R9
  where the ratings changed a default, and add a pointer to the guidelines in CLAUDE.md.
  **Blocked on the user's ratings.**
- [x] T014 [P] [haiku] [US2] Write a `CLAUDE.md` from the rated template for each package in
  `apps/crawler/packages/` (`config`, `core`, `crawler`, `docs`, `fingerprint`, `gates`,
  `mcp-server`, `obstacles`, `reference-portal`, `safety`, `vault`, `wireframe`) from a fact sheet
  per package that Opus puts in the brief (purpose, layer, exports and users, invariants, where to
  add things, test command and tier, spec links). Max ~60 lines each. Content after phases 5–6
  moves is refreshed in T047.
- [x] T015 [P] [haiku] [US2] Same for `apps/chat/CLAUDE.md`, `packages/workflow/CLAUDE.md`,
  `apps/dashboard/CLAUDE.md`, `apps/proving-ground/CLAUDE.md` (check first that none exists; if one
  does, merge rather than overwrite).
- [x] T016 [opus] [US2] Review T014–T015 against the code (every claimed export and user is
  real); glossary sync: add or update `docs/glossary/glossary.yaml` entries for "fast tier",
  "slow tier", "agent notes", "code guidelines", then `uv run pathfinder-glossary --write` in
  `apps/dashboard`. Commit group T011–T016.

---

## Phase 4: User Story 5 - Lint that catches AI slips (P2)

**Goal**: typed lint with unawaited promises as errors; size/complexity warnings with a baseline.

**Independent test**: quickstart §3 (SC-006 for the promise).

- [x] T017 [opus] [US5] Typed lint in `apps/crawler/eslint.config.mjs`:
  `tseslint.configs.recommendedTypeChecked`, `parserOptions.projectService: true`,
  `tsconfigRootDir: import.meta.dirname`, `disableTypeChecked` for `**/*.{js,mjs,cjs}`;
  `@typescript-eslint/no-floating-promises` and `no-misused-promises` as `error`; the other
  type-checked rules as rated in T013 (noisy `no-unsafe-*` as `warn`). Measure `pnpm lint` wall
  time before/after into `lint-baseline.md`. Produce the finding list per package for T018–T019.
- [x] T018 [P] [sonnet] [US5] (done inline by Opus with T019: only ~40 errors after autofix,
  most needing judgment; list and fixes in `lint-baseline.md`) Fix the typed-lint errors in `config`, `core`, `fingerprint`,
  `obstacles`, `safety`, `vault`, `wireframe`, `docs`, `reference-portal` (from T017's list): `await`
  where the result matters, `void` with a one-line reason where fire-and-forget is intended,
  never a blanket disable. Fast tier green per package.
- [x] T019 [P] [sonnet] [US5] Same for `crawler`, `mcp-server`, `gates`; any change inside
  `mcp-server/src/runtime/**` or `crawler/src/**` needs `pnpm test:slow` green as well.
- [x] T020 [opus] [US5] Review T018–T019 (each `void` is really fire-and-forget; no behaviour
  change; unhandled rejections now caught are logged as findings). Apply the same typed config to
  `apps/chat` and `packages/workflow` (their own eslint configs) and fix their findings.
- [x] T021 [sonnet] [US5] Size and complexity warnings in `apps/crawler/eslint.config.mjs` (and
  chat/workflow): `max-lines` 400 (skipBlankLines, skipComments), `max-lines-per-function` 80
  (off for `**/tests/**`), `complexity` 15, `max-params` 5, `max-depth` 4 — or the rated values
  from T013 — all `warn`. Add `pnpm lint:report` (`apps/crawler/scripts/lint-report.ts`: counts per
  rule and package from `eslint --format json`). Python: add the ruff complexity report command
  (`uv run ruff check --select C901,PLR0912,PLR0913,PLR0915 --exit-zero`) as a documented command in
  `apps/dashboard/CLAUDE.md`. Write the first counts to `specs/012-maintainability/lint-baseline.md`.
- [x] T022 [opus] [US5] Checkpoint: quickstart §3; commit group T017–T022.

---

## Phase 5: User Story 3 - A small, stable core with enforced boundaries (P2)

**Goal**: kernel without feature schemas; layer rule enforced by a test. No DB change.

**Independent test**: quickstart §4 (SC-004 core part, SC-006 boundary part).

- [x] T023 [opus] [US3] Layering analysis (tracer writes the DB directly → tracer and decision
  log go to `store`; pure trace parts form the `trace` model package; see `move-map.md`): read `core/src/trace/tracer.ts` (does it write the DB
  directly or through an injected writer?), `core/src/db-types.ts`, `db.ts`, `migrate.ts`,
  `audit.ts`, `portal-data.ts`; decide the final package list (research R6 open points, as rated
  in T013) and write `apps/crawler/layers.json` (contracts/layers.md) and a move map
  `specs/012-maintainability/move-map.md`: for each moved file its new package and path, and for
  each exported symbol the new import specifier. Order the moves so each is one green commit.
- [x] T024 [opus] [US3] (no exceptions needed: the new packages do not exist yet, today's graph
  has no upward edge; each move keeps it green) Boundary test `apps/crawler/tests/layers.test.ts` (and the root of the
  crawler Vitest projects so it runs in the fast tier) per contracts/layers.md: rules 1–4 and the
  exact failure message `layer rule: <pkg> (<layer>) may not depend on <dep> (<layer>) — move the
  shared part down or add an exception with a reason`. It reads every workspace `package.json`
  (crawler packages, `apps/chat`, `packages/workflow`). Write it against today's graph first with
  the known violations listed as temporary `exceptions` (reason "moved in T025–T029"); each move
  task removes its exception.
- [x] T025 [sonnet] [US3] (done by Opus: the decision-log split of `log.ts` needed judgment)
  Create `@pathfinder/store` in `apps/crawler/packages/store/`
  (package.json, tsconfig, vitest config like the other packages) and move `db.ts`, `db-types.ts`,
  `migrate.ts`, `audit.ts`, `portal-data.ts` and their tests from `core` per `move-map.md`; update
  the dependents' `package.json`.
- [x] T026 [haiku] [US3] (55 files, two Haiku agents) Update the import specifiers for T025's symbols in every importing file
  listed in `move-map.md` (Edit tool per file; no codemod scripts); run typecheck.
- [x] T027 [opus] [US3] (fast + slow tiers instead of the full `pnpm test`, which is the close-out
  check) Review T025–T026; all tiers green (`pnpm test`), dashboard schema-drift
  test green, no change under `data/migrations/` or `data/schema/`; remove the T025 exception from
  `layers.json`; commit.
- [x] T028 [sonnet] [US3] (done by Opus; `trace`, `docs-model`, `chat-model` in ONE commit, not one
  per package: they share one import pass and one test run; tests split by owner from core's
  `schemas.test.ts`) Create the feature-model packages decided in T023 (e.g.
  `@pathfinder/docs-model`, `@pathfinder/chat-model`, `@pathfinder/trace`) and move their schemas
  (and the tracer if T023 placed it there) with tests, one package per commit; `store`'s
  `db-types.ts` imports the enums from them.
- [x] T029 [haiku] [US3] (41 files, two Haiku agents) Update import specifiers for T028's symbols per `move-map.md`, one
  package's set at a time; typecheck after each.
- [x] T030 [opus] [US3] (no exceptions were ever needed; G-12 rule scoped to `mcp-server/src`)
  Review T028–T029 per package; all tiers green; remove the remaining
  exceptions; check `packages/core/src/schemas/` holds no doc, chat or trace schema and `core`'s
  `package.json` has no `@pathfinder/*` dependency; add ESLint `no-restricted-imports` for the
  in-package rules accepted in T013 (e.g. MCP tool files may import `runtime/index` only), with
  the guideline id in the message. Commit group T023–T030.

---

## Phase 6: User Story 4 - The three hubs split into small, single-purpose files (P2)

**Goal**: `pipeline.ts` → named steps with one decision/trace wrapper and a step context;
`app.py` → one router per page. Before R-28.

**Independent test**: quickstart §5 (SC-004 hub part, SC-005).

- [x] T031 [opus] [US4] Golden behaviour lock
  `apps/crawler/packages/mcp-server/tests/pipeline-golden.e2e.test.ts`: a map run and a trace run
  on the mock portals; snapshot states (route template, fingerprint level 1, evidence ref shape),
  edges (from, to, action role/name, safety class, allowed, skip reason), decision-log entries
  (kind, rule, reason) in order, and the span tree normalised with `tests/trace-normalise.ts`.
  Run it three times on unchanged code to prove it is stable before any split.
- [x] T032 [opus] [US4] (as built: `StepContext` + `step()` in `pipeline/context.ts`; steps keep their
  tracer/decision calls, see findings F-10; T032–T035 landed as one commit, the golden test passing
  after each stage) `runtime/pipeline/step-context.ts`: `StepContext` (ctx, run, run state,
  via, depth, trace step, re-login target) and the `step(name, fn)` wrapper extending `phase()` so
  a step returns its result plus decision entries and tracer events, recorded by the wrapper in
  the original order. Move `pipeline.ts` to `runtime/pipeline/index.ts` unchanged first (one
  commit), callers still import the same functions.
- [x] T033 [sonnet] [US4] (done by Opus, exact line-range copies) Extract the pure and small helpers from `runtime/pipeline/index.ts` into
  their own files (`gate.ts`: `traceGate` (now `gateEvent`, T051), `itemCapChecked`, `usage`, `gateContext`,
  `navigationPolicy`; `stop.ts`: `persistStop`, `throwIfStopped`; `actions.ts`: `ActionRow`,
  `withoutPageUrl`, `descriptorOf`, `getAction`, `inputValue`; `network.ts`: `recordNetwork`;
  `visuals.ts`: `captureStateVisuals`; `autofill.ts`: `autofillBeforeSubmit`), one file per commit,
  golden + slow tier green each time.
- [x] T034 [opus] [US4] Split `processPage` (260 lines) into steps on the `StepContext`:
  `settle.ts`, `relogin.ts`, `observe.ts`, `fingerprint-step.ts`, `record-state.ts`, with the inline
  decision/tracer calls moved into the wrapper; then `issueAndEnqueue` (172) into `enqueue.ts`. One
  step per commit; golden snapshot unchanged each time.
- [x] T035 [opus] [US4] (largest file `act.ts` 250 lines; no function over 80 or over 5 params in
  `runtime/pipeline/`) Split `navigateStep`/`navigate` into `navigate.ts`, `actStep`/`act`/`gateAct`
  into `act.ts` (+ `act-gate.ts` if over the limit), `login`/`relogin` into `login.ts`,
  `traceBoundary` into `trace-boundary.ts`; `index.ts` keeps only re-exports of the public
  functions. Check: no file over 400 lines, no function over 80 (`pnpm lint:report`), golden and
  all tiers green, `browser-runtime.ts` unchanged apart from imports. Log in `findings.md` anything
  R-28 should know about the new layout.
- [x] T036 [opus] [US4] (`Web` object on `app.state.web`, routers call `web_of(request)`;
  `create_app()` keeps aliases `ctx = web.ctx` etc. for the routes not moved yet) Dashboard: create `apps/dashboard/src/pathfinder_dashboard/web/deps.py`
  (the `create_app()` closures `ctx`, `render`, `missing`, `not_found`, `header_portals`,
  `current_glossary`, `glossary_or_none` as a `Web` object on `app.state` or FastAPI dependencies)
  and move the first page, `web/glossary.py` (4 routes + its fragments), as the pattern; all
  dashboard tests green; record the pattern in the brief for T037.
- [x] T037 [sonnet] [US4] (one commit for all routers, not one per module; app.py 2,006 → 172
  lines; findings F-09) Move the remaining routes from `app.py` into one `APIRouter` module per
  page following T036: `overview.py` (`/`), `runs.py`, `states.py`, `docs.py`, `chat.py`,
  `portals.py`, `activity.py`, `evidence.py`, `events.py`, `amendments.py`, `health.py`; each
  `/fragments/*` route goes to the page it serves. One module per commit; URL paths unchanged;
  `uv run ruff check && uv run pytest` green each time.
- [x] T038 [opus] [US4] (same 55 routes, every page and run tab 200 on a live server; one
  function slightly over 80: `docs_section_values` ~90) Review T037: `app.py` only builds the app; no router imports another
  router; no file over 400 lines or function over 80 (ruff report); browser check of every page
  (quickstart §5 step 3, `uv run pathfinder-dashboard`, then stop it and check for leftover
  processes). Commit group T031–T038.

---

## Phase 7: User Story 6 - Mutation testing of the stable core, on demand (P3)

**Goal**: one command per language, reports outside the commit/merge checks.

**Independent test**: quickstart §6 (SC-007).

- [x] T039 [opus] [US6] (vitest runner never activated mutants on Vitest 5 → command runner, in
  place; findings F-11) Stryker spike on `fingerprint`: add `@stryker-mutator/core` and
  `@stryker-mutator/vitest-runner` (devDependencies of `apps/crawler/package.json`; the repo root
  has no `package.json` by the constitution; run `pnpm install` at the repo root per CLAUDE.md), `apps/crawler/stryker.config.json` (`testRunner: vitest`, `incremental: true`, reports
  to `data/mutation/stryker/`), run on `packages/fingerprint/src/**`. If the runner fails on
  Vitest 5, switch to the `command` runner (`vitest run --project fingerprint`) and note it in
  research R12.
- [x] T040 [sonnet] [US6] (done by Opus; `obstacles` left out of the default: browser-only tests)
  `pnpm mutate [--package <name>]` script (default: the kernel packages
  from `layers.json` plus `safety` and `config`); add `data/mutation/` to `.gitignore` under the
  generated-data block (like `data/gates/`); run it once and append the summary (package, mutants,
  killed, survived, timeout, score) to `findings.md`.
- [x] T041 [P] [sonnet] [US6] (Sonnet set it up and found the blocker; Opus made the tests find the
  repo by a marker file, `tests/paths.py`) mutmut for the dashboard: dev dependency in
  `apps/dashboard/pyproject.toml`, `[tool.mutmut]` limited to the pure modules (`diagrams.py`,
  `glossary.py`, `visuals.py` and query helpers that take plain data), run once, summary in
  `findings.md`; document the commands in `apps/dashboard/CLAUDE.md`.
- [x] T042 [opus] [US6] (findings F-12) Read the surviving mutants of T040–T041; log each meaningful group as a
  finding with the missing test idea (the tests themselves are follow-ups unless trivial); confirm
  neither command runs in the hook or `pnpm test`. Commit group T039–T042.

---

## Phase 8: User Story 7 - Code review and refactor at the end of every feature (P2)

**Goal**: `refactor-code` skill, `code-reviewer` subagent, close-out step.

**Independent test**: quickstart §7 (SC-008).

- [x] T043 [opus] [US7] Write `.claude/skills/refactor-code/SKILL.md`: lock behaviour first
  (golden/snapshot or existing tests), extract-then-move, one file per commit, tiers per change,
  no behaviour change, how to judge `small` vs `large`, pointers to `docs/code-guidelines.md` and
  the package `CLAUDE.md`. Use the `subagent-authoring` skill's guidance for skill vs agent split.
- [x] T044 [opus] [US7] Write `.claude/agents/code-reviewer.md` with the `subagent-authoring`
  skill: tools Read, Grep, Glob, Bash, Edit; skill `refactor-code`; input = branch vs `master`;
  output = `contracts/review-report.md`; fixes only behaviour-neutral `small` findings; never
  commits.
- [x] T045 [haiku] [US7] Add the close-out step to CLAUDE.md "Feature Workflow (SDD)" item 4:
  "run the `code-reviewer` agent on the branch; fix or defer its findings" before the changelog
  step (exact text from the brief).
- [x] T046 [opus] [US7] (SC-008 met; R-34 review: 8 findings, 4 fixed incl. apps/crawler/CLAUDE.md,
  1 deferred = G-18 question F-10, 3 rejected) Planted-branch check (quickstart §7): throwaway branch with a 120-line
  function in a crawler package and a cross-router import in the dashboard; run the reviewer; both
  reported with guideline ids (SC-008); delete the branch. Then run the reviewer on R-34's own diff
  as its first real use and act on the findings. Commit group T043–T046.

---

## Phase 9: Polish & close-out

- [x] T047 [haiku] (done by Opus alongside each move; layer lines now match layers.json) Refresh every package `CLAUDE.md` (T014–T015) for the moves of phases 5–6
  (new packages `store` and the feature models get their own; `mcp-server` notes describe
  `runtime/pipeline/`; dashboard notes describe `web/`), from an Opus fact sheet.
- [x] T048 [opus] (all green; results in spec.md "Checked") Full validation: quickstart §1–§7 end to end; `pnpm typecheck && pnpm lint &&
  pnpm test` in `apps/crawler`, chat and workflow suites, `uv run ruff check && uv run pytest` in
  `apps/dashboard` and `apps/proving-ground/backend`; record SC-001–SC-009 results (numbers) in
  spec.md under a "Checked" line and in `findings.md`.
- [x] T049 [haiku] (R-34 stays "in progress" until the close-out; glossary +2: mutation testing,
  behaviour lock; how-to-use unchanged, no BA-facing command changed) Docs: roadmap R-34 row (status, commits), note in R-28's row that the pipeline
  now lives in `runtime/pipeline/`, glossary sync for terms added since T016 (`uv run
  pathfinder-glossary --write`), `docs/how-to-use.md` only if a BA-facing command changed (none
  expected).
- [x] T051 [opus] (added 2026-10-08 after the user chose option B for F-10) Pipeline steps
  return their reports (G-18): `Reported<T>` / `decision()` / `event()` / `fail()` / `orFail()`
  in `pipeline/context.ts`, `step()` writes them inside the span; every step converted;
  `obstacles-trace.ts` replaced by `obstacleReports`; `reach_state` split into a `gate` step and
  the navigation, so the gate event precedes the request it allows. ESLint `no-restricted-syntax`
  forbids `ctx.decisions` / `ctx.tracer.event*` in `pipeline/**` (except `context.ts`, `stop.ts`).
  Unit tests `tests/pipeline-reports.test.ts` (12). Golden: trace run unchanged; map run differs
  only in 32 `gate_decision` events moving from `reach_state` to the new `gate` span (states,
  actions, edges, frontier and decision log identical modulo ids); snapshot updated on purpose.
- [x] T052 [opus] (added 2026-10-08, F-12) Mutation follow-up tests, in the order of F-12:
  `core/pii.ts` + `core/secrets.ts`, `safety/scope.ts` + `robots.ts` + `rules.ts` +
  `classifier.ts`, `fingerprint/fingerprint.ts`, `core/element-key.ts`, then `core/log.ts`,
  `core/zip.ts`, the dashboard glossary loader; rerun `pnpm mutate --package <name>` and record
  the new scores in `findings.md`. **As built**: 8 `*-boundaries`/`secrets` test files in core,
  safety, fingerprint and `test_glossary_edges.py`; core 82.6 %, safety 91.7 %, fingerprint
  73.1 %, dashboard 89.3 % (F-12); the reruns surfaced F-15 (stale incremental results, fixed)
  and F-16 (in-place mode touches the whole app, documented).
- [x] T050 [opus] Close-out per CLAUDE.md: code-reviewer pass (T046 covered R-34's diff; rerun if
  later commits), changelog skill / `po` agent writes the CHANGELOG entry, merge to master, delete
  the branch, update memory with the R-34 state. **As built 2026-10-08**: code-reviewer rerun on
  865ceca..5141b23 (T005, T051, T052): 6 items, no fix needed; close-out suites green (crawler
  `pnpm test` 131 files, 1,651 passed + 2 skipped, 3 min 45 s; chat 222; workflow 27; dashboard;
  proving-ground backend); CHANGELOG entry by Opus; squash-merged on master, tag v1.0.11. No new
  glossary terms since T049.

---

## Dependencies & execution order

```text
Setup T001–T002
  └─► US1 tiers T003–T010 ─► US2 guidelines T011–T016 (T013 waits for the user's ratings)
                                 └─► US5 lint T017–T022
                                       └─► US3 core T023–T030
                                             └─► US4 hubs T031–T038 (before R-28)
                                             └─► US6 mutation T039–T042 (needs the kernel from T030)
                                                   └─► US7 reviewer T043–T046 ─► Polish T047–T050
```

- T011–T012 can be done while the user is still busy; T013 and everything that reads the rated
  limits (T017, T021, T023, T030) wait for the ratings. If waiting blocks the work, T031–T035
  (pipeline, using the default limits) may start right after T010 and be checked against the rated
  limits later.
- Inside a phase, Sonnet/Haiku tasks wait for the Opus task that sets their pattern or list
  (T004 before T005's run, T017 before T018–T019, T023 before T025–T029, T032 before T033, T036
  before T037).

## Parallel opportunities

- US1: T005 (insurer split) ∥ T008 (pytest-xdist) ∥ T009 text draft.
- US2: T014 ∥ T015 (different packages); T012 rating page while T011 text is being reviewed.
- US5: T018 ∥ T019 (disjoint packages).
- US6: T040 ∥ T041 (TS vs Python).
- US4: T036–T037 (dashboard) ∥ T033–T035 (pipeline): different apps; keep their commits separate.

## Implementation strategy

- **MVP**: Phase 1 + US1 (T001–T010): every later commit gets cheaper; stop and measure.
- Then US2 to get the rated target, US5 for cheap safety, US3 and US4 as the refactor proper,
  US6 and US7 last.
- Each task group is one or more green commits with the task ids in the message
  (CLAUDE.md feature workflow 3). Stopping mid-way: write a session dump listing done,
  uncommitted and blocked tasks.

## Task count

| Phase | Tasks | opus | sonnet | haiku |
| --- | --- | --- | --- | --- |
| Setup | 2 | 1 | 0 | 1 |
| US1 tiers | 8 | 4 | 2 | 2 |
| US2 guidelines | 6 | 3 | 1 | 2 |
| US5 lint | 6 | 3 | 3 | 0 |
| US3 core | 8 | 4 | 2 | 2 |
| US4 hubs | 8 | 6 | 2 | 0 |
| US6 mutation | 4 | 2 | 2 | 0 |
| US7 reviewer | 4 | 3 | 0 | 1 |
| Polish | 4 | 2 | 0 | 2 |
| **Total** | **50** | **28** | **12** | **10** |
