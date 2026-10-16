# Tasks 031: Roadmap declutter 2 (R-67)

Spec [spec.md](spec.md). Model tags: `[opus]` judgment and subtle code, `[sonnet]` mechanical
code, `[haiku]` docs/config. Commit per group with the task ids. Order: small and safe first, the
shared wait (risky, slow tier) late, refactors last.

## G1 Tests the findings asked for (US8)

- [X] T001 [sonnet] F-14: cases for `.claude/hooks/no-script-edits.py` (`cat >>`, `python3 - <<EOF`,
  `sed -i` on tracked files) and the hook widened until they pass (findings F-01; F-02 prettier
  hook fixed too)
- [X] T002 [sonnet] F-15: the pre-commit hook runs the dashboard review tests when
  `apps/crawler/scripts/` changes
- [X] T003 [opus] F-05: a test where `perform` throws; the item is retired `act_failed`
  (`tests/act-crash.test.ts` on `retireOnCrash`, crash codes vs refusals)
- [X] T004 [sonnet] F-13: doctor `net.proxy` also probes a CONNECT tunnel to an http target; test
- [X] T005 [opus] F-07: slow e2e test running one hook with a named inner function through a
  `tsx`-started server (`hook-name-shim.e2e.test.ts`, findings F-04)
- [X] T006 [opus] F-08: perf gate for the bank's first logged-in page settle time (baseline recorded)
  — gate `F-08@030` in `gates/tests/login-settle.test.ts`; found F-03 (10 s per bank page)

## G2 Credential values masked, ids readable (US3, GC-10)

- [X] T007 [opus] Reproduce (persona id = login name) as a test, fix, scar or gate case
  (`secretValues`: a non-secret field equal to the persona or portal id is not registered;
  `tests/credentials.test.ts` fails on the old code with `[secret]`)

## G3 Environment visible (US2, R-61)

- [X] T008 [sonnet] Dashboard header shows the environment of the open store (`#header-env`;
  search starts narrower, `.mp-search`, so the header keeps one row at 1280 px; ui:check ok)
- [X] T009 [opus] Dashboard warns about live servers on another environment or checkout
  (`servers.py` reads `data/servers/*.json`, callout "Servers disagree"; `tests/test_servers.py`)
- [X] T010 [opus] Mutation run on the environment guard; kill or explain survivors (73 → 96 %,
  findings F-05)

## G4 Corporate CA (US4, R-63)

- [X] T011 [opus] `network.ca_file` in the portal schema, trusted by the browser context; doctor
  check; scar or test with a self-signed CA

## G5 Shop and frontier leftovers (US6, R-55, R-58)

- [X] T012 [opus] S05: why autofill leaves the checkout invalid; fix; gate (labels not tied to
  inputs, placeholder masks; gate F-08@031; the CAPTCHA stays a human's, findings F-08)
- [X] T013 [opus] S07 / R-58 (2): visibility at hand-out; gate — cause found, not fixed: the screen
  differs when loaded by URL (needs R-66's reach-by-navigation); known gap F-11@031, findings F-11
- [X] T014 [sonnet] Trailing counts dropped for same-target inference; unit test — narrowed: the
  owner's F-04@026 rule keeps "(0)" apart, so only non-zero counts fold (`linkNameKey`, findings
  F-07)
- [X] T015 [opus] R-58 (3) shared navigation not re-handed out; gate — no code: links to a reached
  target are already settled at pick time without a turn (spec 013/026, gate F-04@026); for
  buttons it would be a guess (findings F-12)
- [X] T016 [sonnet] Eval check `ba_code_names` (F-05@026); unit test (`data_items_code_names` in
  `ba-shapes.ts`)

## G6 Trace variants grouped and drawn (US5, R-64)

- [X] T017 [opus] `portal:trace` groups a trace's runs as one process with variants; test — as an
  open grouping suggestion (Pathfinder only proposes; the BA accepts it in Processes):
  `services/trace-grouping.ts`, `observedSteps`/`screensKey` moved to chat-model; SC-18 gate
- [X] T018 [sonnet] Dashboard flowchart per process variant; route test (a PROC record draws one
  map per cited trace run; `process_diagram_inputs`)

## G7 Script-written pop-ups (US7, LO-27)

- [ ] T019 [opus] Read a script-written window; LO-27 gap → gate — **deferred** (findings F-09:
  needs a second-page observation path in the pipeline; LO-27 stays a gap in R-35)

## G8 One shared wait (US1, R-60) — slow tier

- [X] T020 [opus] Progress signals with new-URL counting; settle on `waitForCondition`; unit tests
- [X] T021 [opus] Mount wait on `waitForCondition`; `timeouts.settle_hard_ms`, `mfe_quiet_ms`
  (the mount wait's hard limit stays `mfe_wait_ms`)
- [X] T022 [opus] Full slow tier, F-08 perf case compared; findings (2026-10-16 23:3x: e2e 56,
  gates 152, perf green; F-08@030 page cap 8 s and empty-mount wait under 6 s hold)

## G9 Deferred guideline findings (US9)

- [X] T023 [opus] Refactors from the spec 030 close-out list, one file per change — done: G-22
  scar-maker `new Function` (rules are functions, their source goes to the page), G-03
  `classifyAction` (37 → 20, `readEvidence`), G-02/G-03 `session.launch` (`contextOptions`,
  `gateOptions`, `watchPopups`), G-04 `RunState` constructor (named parts); still listed:
  `createRequestGate`/`install`, `registerTools`/`registerBaTools`, `createBrowserRuntime`,
  `processPage`, `startRunRecord`, store `tracer.ts`/`db-types.ts`/`db.test.ts`, docs
  `seedDocRecords`, mcp-server CLAUDE.md length, two long test files

## Close-out

- [X] T024 [opus] `pnpm test` in `apps/crawler`, every app's suite; code-reviewer; glossary sync;
  roadmap rows; changelog; session dump (merged by the owner's go, 2026-10-16: squash without the
  other session's files, which follow as their own commit; findings F-13)
