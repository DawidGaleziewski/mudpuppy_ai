# Tasks 020: Roadmap declutter (R-52)

Spec [spec.md](spec.md) · Plan [plan.md](plan.md). Model tags: `[opus]` judgment and subtle code,
`[sonnet]` mechanical code, `[haiku]` docs/config. Commit per group with the task ids.

## G1 Evals are safe to run (US1, R-40) — fast tier

- [X] T001 [sonnet] [US1] Move `packages/gates/tests/eval-checks.test.ts` and `eval-compare.test.ts`
  into the fast tier: exclude `tests/eval-*.test.ts` from the `gates` project, include
  `packages/gates/tests/eval-*.test.ts` in the root `repo` project; confirm with `pnpm test:fast`
  output (FR-001, SC-001)
- [X] T002 [opus] [US1] `evals/harness/outcome.ts`: `classifyOutcome(CliOut)` → success,
  budget_end, api_error, usage_limit; unit tests for each in `evals/tests/outcome.test.ts` (FR-002,
  SC-002)
- [X] T003 [opus] [US1] `runAgent` returns the outcome; usage limit aborts with exit 3, API error
  with exit 2; `EvalResult.outcomes` (optional) stored per agent; results test (FR-002, FR-003)
- [X] T004 [opus] [US1] One eval at a time: lock file `pathfinder-eval.lock` in the OS temp folder
  (machine-wide, as the usage quota is account-wide) with the pid, stale lock taken over, removed on
  exit; unit test of the lock helper (FR-003)
- [X] T005 [opus] [US1] Preflight refuses a port held by a process the eval did not start (port
  from the task's probe URL, holder from `ss`), naming port and process; `ensurePortal` no longer
  reuses a running server; `stopServer` waits for the port to be free, SIGKILLs the group after
  5 s and reports a port still held; tests with a dummy listener (FR-004, FR-005, SC-003)
- [X] T006 [haiku] [US1] `evals/README.md`: exit codes (0, 1 regression, 2 bad input/preflight/API
  error, 3 usage limit), the lock, the port rule, chaining with `&&`

## G2 Small correctness fixes (US2, R-36 part) — fast tier

- [X] T007 [opus] [US2] F-12@008: widen radio/checkbox/switch region boxes by their label's
  estimated width (pure helper + unit tests; golden crop test contains the label) (FR-006, SC-006)
- [X] T008 [sonnet] [US2] F-05@004: a re-issued action's stored `allowed`, `skip_reason`,
  `safety_class` follow the latest decision; test (FR-007)
- [X] T009 [opus] [US2] F-16@004: `reviseRecord` carries over the previous revision's links to runs
  outside the session (one link per run, no dedupe needed); test (FR-008)

## G3 Crawler gaps with a known cause (US3, R-35 part) — slow tier

- [X] T010 [sonnet] [US3] LO-08: the gate adds a product in a run of its own, opens the cart and
  expects the raw key; `gap` → `gate` (FR-009, SC-004)
- [X] T011 [opus] [US3] F-14@004: trace runs are not refused for map depth (`gateContext`); gate
  `F-14@004` traces past `max_depth` (FR-011, SC-005)
- [X] T012 [opus] [US3] LO-27 (part): `BrowserSession` notes opened windows' URLs and closes them;
  map `act` queues each pop-up URL as a gated `navigate` frontier item (`pipeline/popups.ts`); a
  trace only notes it; gate `F-04@020`; LO-27 stays a gap for script-written windows (findings
  F-04); frame-less pop-up requests no longer crash the request gate (F-05) (FR-010, SC-004)
- [X] T013 [opus] [US3] F-19@015: S08 linked from the insurer policy screen (proving ground);
  S11 analysed (the crawler issues its link; the agent does not take it) and left in R-35;
  findings F-06 (FR-012)

## G4 Pan and zoom for diagrams (US4, R-19) — fast tier

- [X] T014 [sonnet] [US4] `diagram-zoom.js` (attached by `diagrams.js`): pan (drag), zoom (wheel
  around the pointer once the diagram is clicked, Ctrl/⌘+wheel and pinch always, + / − buttons),
  fit, on the rendered SVG's `viewBox`; re-attached after live swaps; styles on tokens in
  `app.css`; route test for the load order; browser check in findings F-02 (FR-013, SC-007)

## G5 Stale entries (US5) — docs

- [X] T015 [opus] [US5] T074 static safety review redone; results in `findings.md` F-01; noted on
  T074 in `specs/001-crawler-map-mode/tasks.md`, which stays open for its live bypass-attempt run
  (FR-014)
- [X] T016 [haiku] [US5] Roadmap: R-52 row, R-19 and R-40 done via R-52, R-35/R-36 rows shrunk to
  what remains, R-47 paused, priorities paragraph (FR-015, SC-008)

## Close-out

- [X] T017 [opus] `pnpm test` in `apps/crawler`, every app's suite; code-reviewer agent and its
  findings; glossary sync; validation checkboxes; spec status; changelog; session dump (merge
  waits for the owner)
