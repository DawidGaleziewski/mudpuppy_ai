# Research: Maintainability (R-34)

Decisions for spec 012. Facts were measured or read from the repo on 2026-10-07; library behaviour
was checked in current docs (Context7: Vitest 5.0.3, typescript-eslint, StrykerJS).

## R1 Fast tier: Vitest `--changed` over the source module graph

- **Decision**: the fast tier runs `vitest run --changed` (uncommitted staged + unstaged changes)
  with the browser end-to-end files and the `gates` project excluded. Workspace packages export
  `./src/index.ts` (checked in `core/package.json`), so Vite's module graph follows imports across
  packages and a change in `fingerprint` reaches the tests of `crawler` and `mcp-server` that import
  it. `forceRerunTriggers` adds the files the graph cannot see: `tests/**/harness.ts`,
  `tests/**/mock-*.ts`, `tests/**/fixtures/**`, `data/migrations/**`, `portals/**`, `personas/**`,
  tsconfig/eslint/vitest configs (Vitest default already includes `package.json` and
  `vitest.config.*`). A trigger match runs the whole fast tier (still without the slow files).
- **Rationale**: built in, no new dependency; the docs confirm `--changed` filters specs to those
  transitively affected and that `forceRerunTriggers` widens it to the full suite.
- **Alternatives**: Nx/Turborepo "affected" (package-level only, a new build system for one
  feature, rejected); keeping today's per-app hook only (still 5 min 40 s for any crawler edit).
- **To verify in the first task**: `--changed` with `test.projects` in the root config, and the
  exclusion syntax for one project (`--project` negation or a separate `vitest.fast.config.ts`
  listing projects). Fallback: a dedicated config file for the fast tier.
- **Verified (T002, Vitest 5.0.1)**: with one comment line appended to
  `packages/fingerprint/src/route-template.ts`, `vitest list --changed --filesOnly` selected 32
  files across `fingerprint`, `crawler` and `mcp-server` (the graph follows workspace imports);
  with nothing changed it selects none. `--project='!gates'` drops the 6 gates files (6 → 0), so no
  separate config file is needed: the fast tier is
  `vitest run --changed --project='!gates' --exclude='**/*.e2e.test.ts'`. Two details from the
  Vitest source (`filterTestsBySource`, `findChangedFiles`): the changed list is staged +
  modified + untracked files of the **whole git repo** as absolute paths, and
  `forceRerunTriggers` is read from the root config only and matched with picomatch against those
  absolute paths. So triggers outside `apps/crawler` (`data/migrations`, `portals`, `personas`)
  must be absolute globs built with `resolve()`, and setting the option replaces Vitest's
  defaults (`**/package.json`, `**/{vitest,vite}.config.*`), which must be spread back in. A
  `package.json` change anywhere in the repo therefore runs the whole fast tier (accepted).

## R2 Marking slow tests: a `*.e2e.test.ts` suffix

- **Decision**: browser end-to-end files are renamed `*.e2e.test.ts` (today: `insurer-run`,
  `map-run`, `trace-map-run`, `workspaces`, `capture`, `trace-run`, plus any other file that
  launches Chromium, found by `canLaunchBrowser`/`chromium.launch` use: 4 files in `mcp-server`, 2 in
  `crawler`, 1 in `obstacles`). Fast tier excludes `**/*.e2e.test.ts` and the `gates` project;
  slow tier runs exactly those; `pnpm test` (all) stays the merge check.
- **Rationale**: a name is visible to agents and humans and needs no tag system; Vitest `--exclude`
  and include globs handle it.
- **Alternatives**: a separate `e2e` Vitest project per package (more config files); test tags
  (not native in Vitest).

## R3 Splitting `insurer-run.test.ts` and the robots test

- **Decision**: split the 10 tests (209 s) into three or four `insurer-*.e2e.test.ts` files by
  concern (robots and page requests; safety refusals and denylist; mapping, resume and stop),
  sharing `insurer()` through a helper module. The mock insurer listens on an ephemeral port
  (`AddressInfo`), so files can run in parallel. The "5 consecutive map runs" test becomes 2 runs;
  the resumed-run case it is often assumed to cover is already its own test ("resumes an
  interrupted run…"), so coverage of the property stays.
- **Rationale**: Vitest parallelises files, not tests within a file; the longest file sets the
  slow tier's floor.
- **Alternatives**: `describe.concurrent` inside one file (shared server context, risky).

## R4 Dashboard tests

- **Decision**: try `pytest-xdist` (`-n auto`) for the dashboard; tests that share a fixture store
  get a per-worker copy if they collide. No affected-test selection for Python in R-34: the hook
  already runs the dashboard only for dashboard/migration/glossary changes.
- **Alternatives**: `pytest-testmon` (keeps a state DB, flaky with fixture DBs; rejected for now).

## R5 Commit hook and the tiers

- **Decision**: extend `.claude/hooks/pre-commit-check.sh`: crawler changes run typecheck, lint and
  `pnpm test:fast`; the slow tier and the gates run in the feature close-out (`pnpm test` =
  everything) and when a task changes the pipeline, the gates harness or the proving ground
  (they are what the slow tier tests). CLAUDE.md "Verification Before Commit" is rewritten to
  match. The hook prints which tier ran.
- **Rationale**: the per-app scoping already exists and works; only the crawler branch is too wide.

## R6 Stable core and layering

Facts: `@pathfinder/core` exports 31 schemas plus ids, log, PII, evidence, element keys, layout,
DB access, `db-types` (the Kysely table map for every table), migrations, audit, portal data and
the tracer; 136 files import the `@pathfinder/core` barrel. `db-types.ts` imports the enums of the
docs, chat, trace and process schemas, so the core cannot drop them while it owns the table map.
Schema users (2026-10-07): chat schemas (`chat-conversation`, `workflow-step`, `process-scope`)
are used only by `apps/chat` (and core's `db-types`); doc schemas by `docs` and `mcp-server`;
`amendment` by `apps/chat` and `docs`; trace schemas by core's tracer and `mcp-server`.

- **Decision (proposed, rated by the user as part of the guidelines, FR-006)**: four layers.
  1. **Kernel** (`@pathfinder/core`, stable): ids, log, PII, evidence store, element keys, layout,
     zip, secrets, and the crawl-model schemas (run, state, action, edge, form, frontier,
     decision log, network call, open question, rule candidate, robots policy, portal data log,
     common). Together with the existing `fingerprint`, `safety` and `config` packages this is the
     spec's "stable core".
  2. **Feature models** (schemas only, no DB): `@pathfinder/docs-model` (doc record, revision,
     relation, review, content, evidence link, analysis session, follow-up task, process,
     process step), `@pathfinder/chat-model` (chat conversation, workflow step, process scope,
     amendment), and `@pathfinder/trace` (trace schemas and the tracer, if its DB writes go
     through an injected writer; otherwise it moves to layer 3 — checked in the layering task).
  3. **Store** (`@pathfinder/store`): DB access, `db-types` composed from the kernel and feature
     table types, migrations runner, audit, portal-data export/delete.
  4. **Features and servers**: `crawler`, `docs`, `vault`, `wireframe`, `mcp-server`, `gates`,
     `apps/chat`, `packages/workflow`.
  Imports go only downward. The kernel imports nothing from the workspace.
- **Migration path**: one layer at a time, each a green commit: create the package, move files,
  update imports (no re-export shims from the kernel, which would keep the dependency), run all
  tiers. Database schema, migrations and stored data do not change (FR-011); the dashboard's
  schema-drift test guards it.
- **Alternatives**: keep one core and only document it (does not stop the churn); one package
  per schema (too many packages); re-export shims from core during the move (keeps core
  depending on features; allowed only inside one commit, never merged).
- **Open for the layering task [opus]**: whether the tracer writes the DB directly (decides
  layer 2 vs 3). The chat-schema question is settled: `@pathfinder/chat-model` (G-10, accepted
  2026-10-07, `guideline-review.md`). All 32 guidelines were accepted unchanged, so the defaults
  in R6, R8 and R9 stand.

## R7 Enforcing the boundaries

- **Decision**: two mechanisms, no new tool. (a) A Vitest test in a new small `tests/` file of the
  crawler workspace reads every workspace `package.json` and fails when a package depends on
  something outside its layer's allowlist (layers from R6, kept in one `layers.json`). pnpm's
  strict `node_modules` already blocks importing an undeclared package, so declared dependencies
  are the real boundary. (b) ESLint `no-restricted-imports` inside packages for internal rules
  (e.g. MCP tool files must not import `runtime/*` internals except through the runtime's index).
- **Rationale**: the package graph is the boundary that matters; a test with a readable message
  names the rule and both packages (FR-010).
- **Alternatives**: dependency-cruiser (powerful, but a new tool and config to learn for a rule
  the package graph already expresses); eslint-plugin-boundaries (file-pattern based, overlaps
  with (a)). Revisit if file-level rules grow beyond a few.

## R8 Type-aware ESLint

- **Decision**: `tseslint.configs.recommendedTypeChecked` with `parserOptions.projectService: true`
  and `tsconfigRootDir`, `@typescript-eslint/no-floating-promises` and `no-misused-promises` as
  errors; `disableTypeChecked` for plain JS/MJS files. Existing findings are fixed in groups per
  package or suppressed with a reason comment. Rules from `recommendedTypeChecked` that are noisy
  on existing code (e.g. `no-unsafe-*` around Playwright `evaluate` results) start as warnings and
  are listed for the guidelines rating.
- **Cost**: typed lint is slower; measure `pnpm lint` before/after and record it.
- Same config applies to `apps/chat` and `packages/workflow`.

## R9 Size and complexity rules

- **Decision**: ESLint core rules as warnings: `max-lines` (400, skip blank/comments),
  `max-lines-per-function` (80), `complexity` (15), `max-params` (5), `max-depth` (4); tests
  exempt from `max-lines-per-function`. Python: a `ruff check --select C901,PLR0912,PLR0913,PLR0915
  --exit-zero` report command (ruff has no warning level). Limits are defaults until rated.
- The first warning counts are written to `specs/012-maintainability/lint-baseline.md`.

## R10 Pipeline split (`pipeline.ts`)

Facts: 1,490 lines; exported `navigate`, `act`, `login`, `beginStep`, `persistStop`,
`navigationPolicy`; only `runtime/browser-runtime.ts` imports it. Long functions: `processPage`
(260), `actStep` (200), `issueAndEnqueue` (172), `navigateStep` (81), `gateAct` (69). It already
has a `phase(ctx, name, fn)` helper; 31 inline `ctx.tracer.event`/`ctx.decisions.record` calls.

- **Decision**: `runtime/pipeline/` folder with one file per step and an `index.ts` keeping the
  same exported functions (callers unchanged):
  `settle.ts`, `relogin.ts`, `observe.ts`, `fingerprint-step.ts`, `record-state.ts`,
  `network.ts`, `visuals.ts`, `enqueue.ts`, `gate.ts`, `navigate.ts`, `act.ts`, `trace-boundary.ts`,
  `step-context.ts`. A `StepContext` object (ctx, run, run state, via, depth, trace step, re-login
  target) replaces the positional optional parameters. A `step(name, fn)` wrapper extends
  `phase()` so a step returns `{ result, decisions, events }` and the wrapper records the
  decision-log entries and tracer events in one place, in the same order as today.
- **Behaviour lock first**: before moving code, a golden test runs a map run and a trace run on
  the mock portals and snapshots states, edges, decision-log entries (kind, rule, reason) and the
  trace span tree with ids, times and durations normalised (the existing `trace-golden.test.ts`
  and `trace-normalise.ts` already do this for spans; extend them to the other three). Every
  split commit must keep it identical (SC-005).
- **Order**: extract pure helpers first, then one step per commit, `processPage` last. Done
  before R-28.

## R11 Dashboard routers (`app.py`)

Facts: 2,187 lines; 56 routes all defined as closures inside `create_app()` (groups: fragments
19, chat 15, docs 5, portals 4, glossary 4, then one each: states, runs, healthz, evidence,
events, amendments, activity, `/`). Shared closures: `ctx`, `render`, `missing`, `not_found`,
`header_portals`, `current_glossary`.

- **Decision**: a `web/` package with `deps.py` (the shared helpers as FastAPI dependencies or a
  small `Web` object put on `app.state`) and one `APIRouter` module per page: `overview.py`,
  `runs.py`, `states.py`, `docs.py`, `chat.py`, `portals.py`, `glossary.py`, `activity.py`,
  `evidence.py`, `events.py`; fragments go with the page they serve, not into one fragments file.
  `create_app()` only builds the app and includes the routers. URL paths do not change; existing
  route tests are the lock (they request every page and partial).
- **Alternatives**: one file per route (too many tiny files).

## R12 Mutation testing

- **Decision**: StrykerJS with `@stryker-mutator/vitest-runner`, `incremental: true`, mutating the
  stable core only (`core` kernel files, `fingerprint`, `safety`, `config`); reports
  (HTML + JSON) under `data/mutation/` (gitignored as generated output, like traces). Command
  `pnpm mutate [--package <name>]`. Python: `mutmut` on the dashboard's pure modules
  (`diagrams.py`, `glossary.py`, `visuals.py`, query helpers that take plain data), command
  `uv run pathfinder-mutate` or a documented `uv run mutmut run`.
- **Risk**: the Stryker Vitest runner documents explicit support up to the Vitest 4.1 pool API;
  the repo uses Vitest 5. A spike task verifies it on `fingerprint` first; fallback: run Stryker
  with the `command` runner against `vitest run <package>` (slower, no per-test coverage).
- **Verified (T039, Stryker 10.0)**: the vitest runner loads and records coverage on Vitest 5 but
  never activates a mutant, so its scores are wrong (findings F-11). The command runner is used,
  in place (`inPlace: true`), one package per run: fingerprint 468 mutants in 80 s.
- Never part of commit or merge checks (FR-018).

## R13 Code reviewer and refactor skill

- **Decision**: `.claude/skills/refactor-code/SKILL.md` (how to refactor to the guidelines: lock
  behaviour first, one file per commit, extract-then-move, all tiers green, no behaviour change)
  and `.claude/agents/code-reviewer.md` (tools: Read, Grep, Glob, Bash for `git diff` and lint; Edit
  only for behaviour-neutral fixes; skill `refactor-code`), authored with the `subagent-authoring`
  skill. Input: the feature branch's diff against `master`. Output: the review report contract
  (contracts/review-report.md). The close-out step in CLAUDE.md runs it before the changelog.
- **Alternatives**: Claude Code's built-in `/code-review` and `/simplify` skills: they look for
  bugs and generic cleanups but do not know this project's guidelines; the close-out may run
  `/code-review` as well, the project reviewer is about guideline conformance.

## R14 Guidelines rating

- **Decision**: a proposal list (about 25–35 items across size limits, layering, patterns for
  adding a tool / route / schema / migration, naming, comments, tests, lint rules, the agent-notes
  template) published as a rating page with a shared store (as for R-22's term review), ratings
  folded into `specs/012-maintainability/guideline-review.md`, accepted items written to
  `docs/code-guidelines.md`, referenced from CLAUDE.md. Rating happens before lint limits and
  refactors are fixed.

## R15 Model split

The user asked to split work three ways (2026-10-07). Rules used to tag `tasks.md`:

- **[opus]**: design and judgment — layering decisions, the step wrapper and step context,
  `processPage`/`actStep` splits, golden behaviour lock, tracing/concurrency-sensitive code,
  hook logic, reviewer and skill design, guideline proposals, Stryker spike, reviewing what the
  other tiers produced.
- **[sonnet]**: code-touching but well-specified — splitting the insurer test file, the dashboard
  routers following a pattern Opus set on the first router, type-aware lint fixes, moving a
  package's schemas once the layering is fixed, pytest-xdist set-up, mutmut set-up, the rating
  page.
- **[haiku]**: very mechanical, low-risk edits with an exact spec — per-package `CLAUDE.md` from
  the template, renaming files to `*.e2e.test.ts`, updating import paths from a given mapping,
  `package.json` script lines, CLAUDE.md/roadmap/glossary text edits, recording measurements.
- Sonnet and Haiku work as background subagents from a brief file in the scratchpad that names
  the exact files to touch and to format (F-03@009); they do not commit. Opus reviews, runs the
  checks and commits per task group.
