# Implementation Plan: Maintainability (R-34)

**Branch**: `feature/012-r34-maintainability` | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/012-maintainability/spec.md`

## Summary

No new product behaviour: R-34 makes the codebase cheaper to change for the developer and the AI
agents. Seven parts, in this order (each a phase, each phase a set of green commits):

1. **Test tiers** (US1): browser end-to-end files renamed `*.e2e.test.ts`; `pnpm test:fast`
   (Vitest `--changed` over the source module graph, without e2e files and gates, with
   `forceRerunTriggers` for what the graph cannot see), `pnpm test:slow` (e2e files + gates),
   `pnpm test` (all, the merge check). The Claude commit hook runs the fast tier for crawler
   changes; CLAUDE.md is rewritten. `insurer-run.test.ts` is split into parallel files and the
   robots test drops from 5 runs to 2. Dashboard tries `pytest-xdist`. (research R1–R5)
2. **Guidelines** (US2): a proposal list rated by the user on a rating page; accepted items in
   `docs/code-guidelines.md`; a per-package `CLAUDE.md` template applied to every package and
   app. (R14)
3. **Lint** (US5): type-aware typescript-eslint with `no-floating-promises`/`no-misused-promises`
   as errors; size and complexity rules as warnings, with a recorded baseline; a ruff complexity
   report for Python. (R8, R9)
4. **Stable core and boundaries** (US3): kernel / feature models / store / features layering,
   moved one layer per commit; a package-graph test enforces the allowed directions; ESLint
   `no-restricted-imports` for in-package rules. No DB change. (R6, R7)
5. **Hubs** (US4): golden behaviour lock first, then `pipeline.ts` → `runtime/pipeline/` with a
   step context and one decision/trace wrapper; `app.py` → one FastAPI router per page. Before
   R-28. (R10, R11)
6. **Mutation testing** (US6): Stryker on the stable core (spike first: Vitest 5 support),
   mutmut on the dashboard's pure modules, on demand only. (R12)
7. **Review at close-out** (US7): `refactor-code` skill, `code-reviewer` subagent, new close-out
   step in CLAUDE.md; checked on a planted branch. (R13)

Work is split `[opus]` / `[sonnet]` / `[haiku]` by the rules in research R15.

## Technical Context

**Language/Version**: TypeScript strict on Node 22+ (crawler workspace, `apps/chat`,
`packages/workflow`); Python 3.13 with uv (dashboard)

**Primary Dependencies**: existing Vitest 5, ESLint 10 + typescript-eslint, prettier, ruff,
pytest, FastAPI. New dev-only: `@stryker-mutator/core` + `@stryker-mutator/vitest-runner`,
`mutmut`, `pytest-xdist`. No new runtime dependency.

**Storage**: unchanged (SQLite store, migrations untouched). Generated reports under
`data/mutation/` (gitignored like `data/gates/`).

**Testing**: the existing 1,365 Vitest tests, 44 gate cases and the dashboard pytest suite are the
safety net; new: golden behaviour lock for the pipeline (states, edges, decision log, spans), a
package-graph boundary test, planted-branch check for the reviewer.

**Target Platform**: developer machine (Linux/WSL), Claude Code hooks

**Project Type**: monorepo (pnpm workspace + uv apps), internal engineering work

**Performance Goals**: crawler commit check < 60 s for a leaf-package change (SC-001); slow tier
≥ 30 % faster than 5 min 40 s (SC-002)

**Constraints**: behaviour unchanged; every commit builds and passes all tiers; one file (or one
layer) at a time; no DB/schema/migration change; pipeline split before R-28; no Python/sed edit
scripts (CLAUDE.md), Edit tool only, then re-read

**Scale/Scope**: 268 source files; refactor only `pipeline.ts`, `app.py` and `core`; 136 files import
`@pathfinder/core`

## Constitution Check

| Principle | Result |
| --- | --- |
| I Observed vs intent | Not touched. Pass. |
| II Evidence and traceability | Golden lock proves recorded evidence, decision log and spans are unchanged. Pass. |
| III Role separation | The new `code-reviewer` subagent reviews code only; it is a developer tool, not a fourth Pathfinder role on portals. Pass. |
| IV Replay verification | Not touched. Pass. |
| V Safety-first exploration | Safety classifier and gates are moved/kept, not changed; gates stay in the merge check; mutation testing strengthens the classifier's tests. Pass. |
| VI Human in the loop | Guidelines only from user-rated items. Pass. |
| VII Deterministic core, pure functions | Strengthened: the kernel becomes smaller and import-free; mutation testing targets the pure packages. Pass. |
| Technical constraints: one package per module, Zod as source of truth | New packages follow "one package per module"; schemas stay Zod, only their package changes. Pass. |
| Python constraints | Dashboard stays read-only on the store; router split changes no SQL. Pass. |
| Development workflow: build order, pure packages have unit tests | New packages carry their existing tests along. Pass. |
| Quality gates: "Coverage is measured at process and requirement level, not code coverage" | Mutation score is reported as a test-strength signal, not a coverage target or gate. Pass. |

No amendment needed. Post-design re-check: same result. The one change to project rules is in
CLAUDE.md ("Verification Before Commit" and the feature workflow close-out step), which is not
the constitution.

## Project Structure

### Documentation (this feature)

```text
specs/012-maintainability/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── test-commands.md        # fast / slow / all tiers, hook behaviour, mutation commands
│   ├── agent-notes.md          # per-package CLAUDE.md template
│   ├── layers.md               # layer allowlist format and boundary-test message
│   └── review-report.md        # code-reviewer output
├── checklists/requirements.md
├── guideline-review.md         # ratings (from the rating page)
├── lint-baseline.md            # first warning counts, lint timings
├── findings.md                 # bugs and slips, with test/eval ideas
└── tasks.md                    # /speckit-tasks
```

### Source Code (repository root)

```text
.claude/
├── hooks/pre-commit-check.sh            # crawler branch → typecheck, lint, test:fast
├── skills/refactor-code/SKILL.md        # new
└── agents/code-reviewer.md              # new
CLAUDE.md                                # tiers, guidelines pointer, close-out review step
docs/code-guidelines.md                  # new, rated items only

apps/crawler/
├── package.json                         # test:fast, test:slow, mutate, lint:report
├── vitest.config.ts                     # forceRerunTriggers; fast/slow selection
├── eslint.config.mjs                    # typed lint, size/complexity warnings, restricted imports
├── stryker.config.json                  # new
├── layers.json + tests/layers.test.ts   # new, package-graph boundary test
└── packages/
    ├── core/                            # kernel only after phase 4
    ├── docs-model/  chat-model/  trace/ # new feature-model packages (final set decided in the layering task)
    ├── store/                           # new: db, db-types, migrate, audit, portal-data
    ├── mcp-server/src/runtime/pipeline/ # new folder replacing pipeline.ts
    ├── mcp-server/tests/insurer-*.e2e.test.ts
    └── */CLAUDE.md                      # agent notes, one per package

apps/dashboard/
├── pyproject.toml                       # pytest-xdist, mutmut (dev)
└── src/pathfinder_dashboard/
    ├── app.py                           # create_app() only
    └── web/  deps.py  overview.py runs.py states.py docs.py chat.py portals.py glossary.py activity.py evidence.py events.py

apps/chat/CLAUDE.md, packages/workflow/CLAUDE.md, apps/dashboard/CLAUDE.md
```

**Structure Decision**: everything stays inside the existing apps and the crawler workspace's
`packages/` (constitution app layout; CLAUDE.md monorepo layout). New packages live in
`apps/crawler/packages/` next to the ones they split from. The final list of feature-model packages
is fixed by the layering task (research R6 open points) and rated with the guidelines.

## Phases and dependencies

```text
P1 test tiers ──► P2 guidelines (rating) ──► P3 lint ──► P4 core/boundaries ──► P5 hubs ──► P7 reviewer
                                    └────────────────────────────► P6 mutation (needs P4 kernel)
```

- P1 first: every later commit is cheaper.
- P2 before P3–P5: limits and layering come from the rated guidelines.
- P5 pipeline split must land before R-28 starts; if R-28 is pulled forward, P5 pipeline goes
  right after P2.
- P7 last so the reviewer is checked against the final guidelines; it can then review R-34's own
  diff as its first real run.

## Risks

| Risk | Mitigation |
| --- | --- |
| `--changed` misses an affected test (CLI-spawned tests, string-loaded files) | `forceRerunTriggers`; slow tier and full suite in the close-out still catch it; log misses in `findings.md` |
| Typed lint floods findings | fix per package in groups; noisy rules start as warnings and go to the rating |
| Schema move breaks 136 importers in one go | one layer per commit, import mapping produced by Opus, applied mechanically, all tiers green |
| Pipeline split changes ordering of decisions or spans | golden lock first; wrapper records in the original order |
| Stryker + Vitest 5 incompatibility | spike on `fingerprint`; fallback command runner |
| Gates estate collisions after splitting e2e files | e2e files use ephemeral ports; gates stay one file at a time |

## Complexity Tracking

No constitution violations to justify.
