# Tasks: spec 046 (repeat replays R4 and R5)

Plan: the reference portal first (login, both scenarios), then the runtime's flags, the store's
plans and verdicts, the driver and runner, the scenario e2e tests, then R-33's leftovers.

- [X] T001 [opus] Reference portal: customer area (`src/pages/account.ts`, two test customers, `sesja` cookie), login POST, account pages for a session (`server.ts`)
- [X] T002 [opus] Scenarios `persona-variant` and `ab-test` (`scenarios.ts`, `Visit`); tests `tests/accounts.test.ts`; guest ground truth unchanged
- [X] T003 [sonnet] Portal `login` block and personas `klient`, `klient-premium` (sandbox and local-dev copies); local-dev vault refs
- [X] T004 [opus] Runtime: probe runs record every cookie and storage key in `flags_json`, the context key stays the declared arm (`runtime/pipeline/observations.ts`)
- [X] T005 [opus] Model: R5 also for a new member on the same build and audience (`interpret/rules.ts`), test updated
- [X] T006 [opus] Store: `deviation-visits.ts` (moved out of `interpret-writer.ts`), `context-replays.ts` (plans, landings, `separatingFlag`, verdicts); unit tests
- [X] T007 [opus] Driver: plan `login`; `replayPortal` runs R4 then R5 (`runContext`)
- [X] T008 [opus] e2e: `tests/context-replays.e2e.test.ts` (persona variant → context_variant, A/B → ab_test separated by cookie:ab_baner)
- [X] T009 [sonnet] R-33 F-03: full scans only (budget-limited runs listed apart) in both access read models; shared fixture; test
- [X] T010 [sonnet] R-33 US4: `samplePersonas` (config) and `pnpm personas:sample <portal>`; tests
- [X] T011 [opus] Slow tier, commit; close-out (review, roadmap R-88/R-33/R-91/R-35, glossary, changelog, merge, push)
