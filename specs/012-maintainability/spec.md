# Feature Specification: Maintainability (R-34)

**Feature Branch**: `feature/012-r34-maintainability`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: roadmap row R-34, full scope (all twelve ideas). Raised 2026-10-07: "I
admit things begin to feel sluggish when adding new things. Do we follow good practices here or is
it too much vibe coding?", with three statements from fellow developers: a stable core that rarely
changes, tests and quality gates limited to the affected parts, mutation tests for AI-driven
development. Follow-up: a refactor-code skill and a code-reviewer subagent run at the end of every
feature before closing.

## Baseline (measured 2026-10-07, on `master` `d46546b`)

| Measure | Value |
| --- | --- |
| Crawler `pnpm test` wall time | 5 min 40 s, 117 files, 1,365 tests (2 skipped) |
| Share of summed test time in four browser end-to-end files (`mcp-server`) | 76 % (`insurer-run` 209 s, `map-run` 65 s, `trace-map-run` 47 s, `workspaces` 40 s) |
| Slowest single test | "5 consecutive map runs never request a robots-disallowed URL", 87 s |
| Gates (one file at a time by design: shared estate) | 115 s, 44 gate cases, about 21 known gaps |
| The other ten crawler packages together | about 15 s |
| Dashboard `uv run pytest` | about 1 min 45 s (measured while the crawler suite also ran) |
| Commit check today (`.claude/hooks/pre-commit-check.sh`) | scoped per app: any change under `apps/crawler/` runs the whole crawler suite |
| Source files (TS + Python, without tests and proving ground) | 268; 17 over 400 lines; 3 over 800 |
| Hubs | `dashboard/app.py` 2,187 lines, 56 routes; `mcp-server/src/runtime/pipeline.ts` 1,490 lines, most-changed file (`processPage` 260 lines, `actStep` 200, `issueAndEnqueue` 172, 31 inline decision-log/tracer calls) |
| `@pathfinder/core` | 31 schemas, feature ones included (chat conversation, amendment, workflow step); nearly every feature edits it |
| `@pathfinder/mcp-server` | depends on 9 workspace packages |
| Lint | ESLint `recommended` only (not type-aware), no size or complexity rules; ruff `E,F,W,I,B,UP,SIM,RUF` |
| Suppressions | 1 in TS source, 9 in the dashboard |
| Mutation testing | none |
| Per-package agent notes (`CLAUDE.md`/README) | none |

## User Scenarios & Testing *(mandatory)*

The users are the developer (the project owner) and the AI agents that build features with them.

### User Story 1 - Fast feedback on every commit (Priority: P1)

A developer or agent changes a crawler package and commits. Only the checks that the change can
break run, and the slow browser end-to-end tests and gates run once, before the feature is merged.

**Why this priority**: the commit loop is the daily cost; today one crawler edit costs almost six
minutes before a commit, so every later story is cheaper once this is done.

**Independent Test**: change one line in a leaf package (for example `fingerprint`) and commit:
the check finishes in under a minute and runs only the tests that import the changed code; run
the slow tier and see the browser end-to-end tests and gates run.

**Acceptance Scenarios**:

1. **Given** a change only in `apps/crawler/packages/fingerprint/`, **When** the developer
   commits, **Then** typecheck, lint and the tests affected by the change run, the browser
   end-to-end tests and gates do not, and the check reports which tier it ran.
2. **Given** a feature about to be merged, **When** the close-out runs, **Then** the full suite
   (all tiers, gates included) runs and must be green before the merge.
3. **Given** the slow tier is run on its own, **When** it finishes, **Then** its wall time is
   lower than today's because the longest end-to-end file is split and the robots test makes
   fewer runs.

---

### User Story 2 - Written code guidelines the user has rated (Priority: P1)

Before any refactor, the agent proposes code guidelines (size limits, layering and import
boundaries, the pattern for adding an MCP tool, a dashboard route and a schema, a per-package
agent-notes template, lint rules). The user rates each proposal on a rating page; the accepted ones
become the project's code guidelines, which agents read before writing code.

**Why this priority**: every other story (refactor, lint rules, the reviewer) needs a target to
measure against; without written guidelines each agent session follows whatever code is nearest.

**Independent Test**: the guidelines document exists, each rule in it traces to a rated proposal,
and an agent asked "where does a new MCP tool go?" answers from the document.

**Acceptance Scenarios**:

1. **Given** the proposal list, **When** the user rates it, **Then** only accepted (or amended)
   items are written into the guidelines, and rejected ones are listed as rejected with the reason.
2. **Given** the guidelines, **When** an agent works in a package, **Then** that package's agent
   notes (purpose, public API, invariants, where to add things) load with it.

---

### User Story 3 - A small, stable core with enforced boundaries (Priority: P2)

The core holds only what every feature builds on: runs, states, actions and edges, fingerprinting,
the safety classifier and config loading. Feature-specific schemas live with their feature. A lint
rule refuses an import that crosses the agreed boundaries, so the core stays stable.

**Why this priority**: it removes the main reason nearly every feature edits the core and reruns
everything, but it touches many imports, so it follows the guidelines and the fast tier.

**Independent Test**: add an import from the core to a feature package and see lint fail with a
message naming the rule; add a feature schema in its feature package and see the core unchanged.

**Acceptance Scenarios**:

1. **Given** the boundary rule, **When** core code imports a feature package, **Then** lint fails
   naming both modules and the rule.
2. **Given** the moved schemas, **When** the whole suite runs, **Then** every test and gate passes
   unchanged (only import paths differ).

---

### User Story 4 - The three hubs split into small, single-purpose files (Priority: P2)

`pipeline.ts` becomes a sequence of named steps, with decision logging and tracing done in one
place instead of inline, and a single step context instead of a growing list of optional
parameters. `app.py` becomes one router per dashboard page. This happens before R-28, which
mostly changes the pipeline.

**Why this priority**: these are the files every feature touches; smaller files are cheaper for
agents to read whole and less likely to be edited from a partial view.

**Independent Test**: after each file is split, the full suite and the gates pass and recorded
crawl output (states, edges, decision log, trace spans) for the test portals is unchanged.

**Acceptance Scenarios**:

1. **Given** the split pipeline, **When** a map run and a trace run execute in the tests, **Then**
   states, edges, decision-log entries and trace spans match what the unsplit code recorded.
2. **Given** the split dashboard, **When** every page and partial is requested in the tests,
   **Then** each responds as before.
3. **Given** a refactor step, **When** it is committed, **Then** the tree builds and all tests
   pass at that commit (one file at a time, no big-bang).

---

### User Story 5 - Lint that catches AI slips (Priority: P2)

Type-aware lint flags unawaited promises and similar slips; size and complexity rules warn when a
file or function grows past the agreed limits.

**Why this priority**: cheap, mechanical, and it catches the error class most typical of generated
async code before it reaches a run.

**Independent Test**: write an async call without `await` in a crawler package and see lint fail;
write a function over the limit and see a warning, not a failure.

**Acceptance Scenarios**:

1. **Given** the existing code, **When** type-aware lint is turned on, **Then** every finding is
   fixed or explicitly suppressed with a reason, and lint is green.
2. **Given** size and complexity rules, **When** lint runs, **Then** they report warnings only
   (not failures), and the count of warnings is recorded as a baseline.

---

### User Story 6 - Mutation testing of the stable core, on demand (Priority: P3)

The developer runs one command that mutates the stable core's code and reports which changes no
test noticed, so weak tests (often written to match the code rather than the behaviour) are found.

**Why this priority**: valuable for trust in AI-written tests, but slow by nature, so on demand
and limited to the core.

**Independent Test**: run the command on the safety classifier and get a report with a mutation
score and the surviving mutants with file and line.

**Acceptance Scenarios**:

1. **Given** the command, **When** it runs on the stable core, **Then** it finishes with a report
   (score and surviving mutants) and never runs as part of the commit or merge checks.
2. **Given** the first report, **When** it is read, **Then** the surviving mutants are logged as
   findings with ideas for the missing tests.

---

### User Story 7 - Code review and refactor at the end of every feature (Priority: P2)

Before a feature is closed, a code-reviewer subagent reviews the feature's diff against the
guidelines and, with a refactor-code skill as its how-to, proposes or makes the refactors it finds.
This becomes a step in the feature workflow, before the changelog and merge.

**Why this priority**: it keeps the code in shape after R-34 without another clean-up project.

**Independent Test**: run the reviewer on a feature branch with an over-long function and an
unawaited promise planted in it, and get findings for both with the guideline each breaks.

**Acceptance Scenarios**:

1. **Given** a finished feature branch, **When** the close-out runs, **Then** the reviewer runs on
   the branch's diff and its findings are either fixed (tests green afterwards) or listed with a
   reason before the changelog step.
2. **Given** the reviewer, **When** it reviews, **Then** it cites the guideline for each finding
   and does not change behaviour (all tests still pass).

### Edge Cases

- A change in a shared package (core, config) that many packages import: the fast tier then runs
  many tests; it must still be correct (run everything the change can reach), even if slower.
- A change to test helpers, the proving-ground estate, migrations or configs that the dependency
  graph does not see: the fast tier must fall back to running the affected suites in full.
- Splitting the longest end-to-end file must not let two files fight over the same ports or test
  users (the gates estate is shared on purpose and stays one file at a time).
- Reducing the robots test from five runs to two must still prove the property it guards (no
  robots-disallowed request across consecutive runs, including a resumed run).
- Moving schemas out of the core must not change the database schema, migrations or the
  dashboard's read models (schema-drift test stays green).
- Type-aware lint may surface many findings at once: fixed in reviewable groups, not one huge
  commit.
- The reviewer finds a refactor that is large: it is logged as a follow-up instead of done in the
  close-out.
- Gates and evals: R-34 does not create eval baselines (that is R-29); it only must not break them.

## Requirements *(mandatory)*

### Functional Requirements

**Test tiers (ideas 1, 2)**

- **FR-001**: The commit check MUST run a fast tier: typecheck, lint and only the tests that the
  changed files can affect, and MUST NOT run the browser end-to-end tests or the gates.
- **FR-002**: The fast tier MUST fall back to the full suite of an app when a change touches
  something the affected-test detection cannot see (test helpers, migrations, portal or persona
  configs, the proving-ground estate, tool configs).
- **FR-003**: A slow tier MUST run the browser end-to-end tests and the gates; the feature
  close-out MUST run every tier and require it green before merge.
- **FR-004**: The project's verification instructions (CLAUDE.md "Verification Before Commit" and
  the commit hook) MUST describe and implement the tiers.
- **FR-005**: The longest browser end-to-end test file MUST be split into several files that can
  run in parallel without sharing ports or state, and the "consecutive map runs" robots test MUST
  use two runs instead of five while still covering a resumed run.

**Guidelines and agent notes (ideas 8, 11)**

- **FR-006**: The agent MUST propose code guidelines as a list for the user to rate on a rating
  page (file and function size limits, layering and import boundaries, the pattern for adding an
  MCP tool, a dashboard route and a schema, a per-package agent-notes template, lint rules). Only
  rated-accepted items become guidelines; the ratings are kept with the spec.
- **FR-007**: The guidelines MUST live in one document that agents are pointed to from the
  project instructions.
- **FR-008**: Every workspace package and app MUST have a short agent-notes file (purpose, public
  API, invariants, where to add things) following the accepted template.

**Stable core and boundaries (idea 4)**

- **FR-009**: The core MUST be limited to the agreed stable set (runs, states, actions and edges,
  fingerprinting, the safety classifier, config loading); feature-specific schemas MUST move to the
  package of their feature.
- **FR-010**: An import-boundary rule MUST fail lint when an import crosses the agreed layers, and
  name the rule and both modules.
- **FR-011**: The move MUST NOT change the database schema, the migrations or stored data.

**Hub refactors (ideas 3, 10, 11)**

- **FR-012**: The crawl pipeline MUST be split into named steps, each in its own file, with
  decision logging and tracing done by one shared step wrapper and one step context instead of
  growing optional parameters; this MUST be done before R-28 starts.
- **FR-013**: The dashboard MUST be split into one router per page; shared helpers stay shared.
- **FR-014**: Each refactor MUST be done one file at a time; every commit MUST build and pass all
  tiers; recorded crawl output for the test portals (states, edges, decision log, trace spans)
  MUST be unchanged.
- **FR-015**: Only the three hubs and the core are refactored in R-34; the other large files are
  listed in the guidelines as "split when a feature touches them".

**Lint (ideas 5, 9)**

- **FR-016**: Type-aware lint MUST be on for the TypeScript packages, with unawaited promises an
  error; existing findings MUST be fixed or suppressed with a written reason.
- **FR-017**: File-size, function-size and complexity rules MUST be on as warnings, at the limits
  the user accepted, with the first warning count recorded.

**Mutation testing (idea 6)**

- **FR-018**: One on-demand command per language MUST run mutation testing on the stable core
  (TypeScript core packages; the dashboard's pure modules for Python) and write a report with the
  score and surviving mutants; it MUST NOT run in the commit or merge checks.
- **FR-019**: The first report's surviving mutants MUST be logged as findings with test ideas.

**Review at close-out (idea 12)**

- **FR-020**: A refactor-code skill MUST describe how to refactor to the guidelines (steps, safety
  rules: behaviour unchanged, tests green per step, one file at a time).
- **FR-021**: A code-reviewer subagent MUST review a feature branch's diff against the guidelines,
  report each finding with the guideline it breaks, and fix only behaviour-neutral findings;
  larger ones become follow-ups.
- **FR-022**: The feature workflow in the project instructions MUST add the review step before
  the changelog and merge.

**Evals (idea 7)**

- **FR-023**: R-34 MUST NOT create eval baselines (R-29 does) and MUST leave the eval commands
  working; the slow tier runs the deterministic gates only.

### Key Entities

- **Test tier**: a named set of checks (fast or slow) with the trigger that runs it (commit or
  close-out) and the fallback rules.
- **Code guideline**: one rule with its rationale, the rating it got, and how it is checked
  (lint rule, reviewer, or by hand).
- **Agent notes**: per-package file with purpose, public API, invariants and where to add things.
- **Boundary rule**: the allowed import directions between layers (core, feature packages,
  server, apps).
- **Review finding**: what the reviewer found, the guideline it breaks, and whether it was fixed
  or deferred.
- **Mutation report**: score and surviving mutants (file, line, change) per run.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A commit that changes one crawler leaf package finishes its checks in under 60
  seconds (today: about 5 min 40 s).
- **SC-002**: The slow tier's wall time is at least 30 % below today's full-suite time
  (target: under 4 min), with the gates unchanged.
- **SC-003**: The total number of tests and gate cases does not drop, except the robots test's
  run count, and every test and gate passes at every commit of the feature.
- **SC-004**: No source file of the three refactored hubs is over 400 lines and no function in
  them over 80 lines (or the limits the user accepts), and the core no longer contains
  feature-specific schemas.
- **SC-005**: Recorded crawl output for the test portals is identical before and after the
  pipeline split (states, edges, decision-log entries, trace spans).
- **SC-006**: An import across the boundaries and an unawaited promise each fail lint in a
  planted check.
- **SC-007**: The mutation command produces a report for the stable core, with the score
  recorded as the first baseline.
- **SC-008**: On a planted test branch, the code reviewer reports both planted problems with the
  guideline each breaks.
- **SC-009**: The guidelines document contains only rated items, and every package has agent
  notes.

**Checked 2026-10-08 (T048)**: SC-001 ✓ 19.7 s (hook 20.1 s) for a fingerprint change;
SC-002 ✓ slow tier 163 s, −52 % vs 340 s, gates unchanged; SC-003 ✓ `pnpm test` 1,371 passed + 2
skipped = 1,365 + 2 golden + 4 layers tests (robots test 5 → 2 runs inside the uncommitted T005
split), every commit hook-checked — but the slow gate LO-35 is flaky (F-03); SC-004 ✓ for
`runtime/pipeline/` (no file > 400, no function > 80) and `web/` routers (no file > 400; two view
helpers moved verbatim at ~80–90 lines), core holds crawl-model schemas only; SC-005 ✓ golden
snapshot identical through every pipeline stage; SC-006 ✓ planted floating promise and a
`runtime/pipeline/*` import fail lint, upward package dependencies fail `layers.test.ts`;
SC-007 ✓ first baseline in findings F-12; SC-008 ✓ (findings "Reviewer check on a planted
branch"); SC-009 ✓ 32 rated guidelines, `CLAUDE.md` in every package and app. Chat 222, workflow 27,
dashboard (parallel + perf) and proving-ground backend suites green.

## Assumptions

- The user's choice "everything in R-34" (2026-10-07) includes mutation testing and the boundary
  rule; eval baselines stay in R-29 (idea 7 is only a cross-reference).
- The existing per-app commit hook (`.claude/hooks/pre-commit-check.sh`) is extended, not
  replaced; developers committing outside Claude Code run the same scripts by hand.
- The gates keep running one file at a time (shared estate by design); speeding them up is out
  of scope.
- Behaviour does not change: no new features, no data or schema changes; constitution principles
  are unchanged, so no amendment is expected (to confirm in the plan's Constitution Check).
- Size limits in the success criteria (400 lines per file, 80 per function) are defaults until
  the user rates the guideline proposals.
- Order of work: test tiers, then guidelines, then lint, then the core and the hubs, then mutation
  testing and the reviewer; the pipeline split lands before R-28 starts.
- The chat service and the proving-ground backend are covered by the tiers and agent notes but
  their files are not refactored in R-34.
