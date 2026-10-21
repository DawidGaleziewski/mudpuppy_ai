# Tasks: spec 021 — remove the production guard (R-42)

Model tags per task ([opus]/[sonnet]/[haiku]). Commit per group with the task ids.

## Group 1 — rules first (US3)

- [x] T001 [opus] Amend `.specify/memory/constitution.md` to 5.0.0: Principle V without a production policy, testing section without "production targets are read-only", the to-be product rule; sync-impact report (research R7)
- [x] T002 [haiku] Explicit `max_action_class: read` in `portals/liveinsurer`, `portals/marketsite`, `portals/reference-insurer-readonly` with the "explicit since spec 021" comment (R6)

## Group 2 — no default limit (US2)

- [x] T003 [sonnet] `config/src/effective.ts`: omitted limit → `external-side-effect`; tests in `config/tests` (omitted → no ceiling; persona lowers it; environment entry still applies)
- [x] T004 [sonnet] Check the trace-boundary path (`act-gate.ts` comment, trace-boundary tests) still stops on an explicit `read`; reword comments that say "production"

## Group 3 — production is a label (US1)

- [x] T005 [sonnet] `safety/src/env-guard.ts` removed (its only other job, the ceiling, is `loadEffectiveConfig`'s), with its test
- [x] T006 [sonnet] `config/src/portal-schema.ts`: drop the production `rate_limit` refinement; `crawler/src/preflight.ts`: drop the placeholder User-Agent refusal and `ENV_GUARD_REFUSED`; `mcp-server/src/errors.ts`: drop `ENV_GUARD_REFUSED` and `PRODUCTION_REFUSED`; tests (`preflight.test.ts`, `load-portal.test.ts`, `start-run.test.ts`, `map-run.e2e.test.ts`, `tracer.test.ts` fixture) rewritten
- [x] T007 [sonnet] CAPTCHA hand-off everywhere: `crawler/src/request-gate.ts` (remove `captchaHandoff` option, always hand off), `crawler/src/session.ts`, `mcp-server/src/runtime/handoff.ts` (no production branch, no `onProductionStop`) and its caller; request-gate tests assert the reported verdict; gate F-01@009 asserts a hand-off on both environments
- [x] T008 [sonnet] Playwright traces everywhere: remove `pwTraceEnabled` and `PATHFINDER_PW_TRACE`; boot mode `all`; `PwTraceMode` keeps `non_production` readable; `trace-config.test.ts`, `pw-trace.e2e.test.ts` (dashboard shows the stored mode as is: no change)
- [x] T008a [sonnet] `autofill.e2e.test.ts`: the production case sets an explicit `read`; new case: production without a limit fills and submits (SC-002)

## Group 4 — docs (US3)

- [x] T009 [haiku] Superseded notes: spec 001 FR-005/FR-006/FR-026, spec 009 FR-022, spec 011 FR-010; `docs/portal-config.md`; `docs/how-to-use.md`; package notes (`safety`, `crawler` CLAUDE.md); crawler agent and ba-practice skill texts; BA tool description
- [x] T010 [haiku] BA fixture texts (`docs/src/testing/doc-records.ts`, `fixture-store.ts`) say "read limit" instead of "production"; goldens regenerated; code comments that stated a removed rule
- [x] T011 [haiku] Glossary: environment, mode, safety class, form autofill, submit boundary, login tool, CAPTCHA hand-off; `uv run pathfinder-glossary --write`
- [x] T011a [haiku] `eval-cases.yaml`: F-08@020 was missing (left on master by 27da780), coverage gate failed

## Group 5 — verify and close

- [x] T012 [sonnet] SC-001 grep; fast tier, `pnpm test:slow` (ports 4200/4201 free), dashboard pytest, chat + workflow suites; close-out `pnpm test` 1921 passed
- [x] T013 [sonnet] Close-out: `code-reviewer` agent, roadmap R-42 row, changelog, merge, tag
