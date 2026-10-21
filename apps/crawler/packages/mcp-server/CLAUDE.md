# @pathfinder/mcp-server

The `pathfinder` stdio MCP server (the crawler agent's only tools: start_run, navigate, act, probe_form, login,
get_known_states, get_next_frontier_item, add_open_question, add_hypothesis, finish_run) and the
`pathfinder-ba` server (BA tools: `src/ba-server.ts`, `src/ba-tools/`, `src/services/ba/`).

Layer: servers (G-07; `apps/crawler/layers.json`)

## Layout

- `src/tools/index.ts`: tool shapes and descriptions; `src/services/*.ts`: the logic per tool.
- `src/runtime/`: the browser runtime. `browser-runtime.ts` owns sessions; `runtime/pipeline/` is
  the crawl pipeline, one file per step or tool:
  - `process-page.ts`: the ordered steps for an observed page (`settle` → `observe` → `net_drain` →
    `fingerprint-step` → `record-state` → visuals → CAPTCHA hand-off → depth → `record-page`
    forms/transition → network → `record_observation` → `enqueue` → trace step) on one
    `StepContext`. `settle` waits through client redirects and for mounts in every frame read;
    `observations.ts` stores the observation (spec 019; `page_visits` until spec 039 T110); `observe` reads frames (`frames.ts`); `composition.ts`
    builds the page composition (spec 015).
  - Portal hooks (spec 023): `runtime/hooks.ts` (the run's runner: Playwright adapter, `hook`
    span and decision note per run, `runPageLoadHooks`, `notePatched`), loaded by
    `services/run-hooks.ts` in `start_run`; called from `navigate` (onBeforePageLoad), `act`
    (onBeforeClickAction), `processPage` (onPageLoad) and the session open/close. Hook runs are
    their own `hook` phases outside `step()` (they wrap owner code, not a pipeline step; G-18
    exception, spec 023 findings row 7). Per-URL timeouts in `settle.ts` / `navigate.ts`.
  - `navigate.ts`, `act.ts` (+ `act-gate.ts`), `login-step.ts`, `relogin.ts`, `trace-boundary.ts`:
    the tool entry points; `gate.ts` (gate context, item cap, `refuse`), `stop.ts` (begin step,
    persist stop, bookkeeping), `actions.ts` (issued action rows, input values), `next-item.ts`
    (`withNext`: map-mode results carry the next frontier item, spec 013); `popups.ts`
    (`queueOpenedWindows`: URLs of pop-ups an action opened become gated `navigate` frontier
    items, spec 020 / LO-27).
  - Map-mode results omit `actions` on a revisited state (`actions_omitted`; tests that read
    them pass `include_actions`). `index.ts` re-exports only the tool entry points and helpers.
- `src/services/frontier.ts` + `same-target.ts`: link items whose target the run already reached
  (same URL and same visible name, spec 026 F-04) become `inferred` transitions (spec 013 US2).
  `frontier-order.ts`: pick order, links to unvisited route templates first (spec 026). BA reads: `services/ba/reads.ts`, `run-evidence.ts`
  (`get_run_evidence`, incl. `observations`, `parameters`, spec 019), `runs.ts` (`list_runs` with
  persona attributes), `access.ts` (`get_access_matrix`, spec 024: same model as the dashboard's
  `queries_access.py`, both checked against `tests/fixtures/access/three-personas.json`).
- Spec 030: `server-context.ts` (`openServerContext`, shared by `server.ts` and `local-client.ts`) and
  `boot-environment.ts` (`PATHFINDER_ENV` has no default); `services/server-registry.ts` (live
  servers, stray warnings); `local-client.ts` + `trace-driver.ts` (`pnpm portal:trace`: drive a trace
  catalogue through the tools); `runtime/render-health.ts` (failed assets per page),
  `pipeline/transient.ts` (re-open a page showing a passing error); `login` can end `pending`.
- Spec 031: `services/trace-grouping.ts` (after `pnpm portal:trace`, the best variant run's screens
  become one open grouping suggestion; the BA accepts it, nothing is created here); `credentials.ts`
  and `run-state.ts` (`RunState` takes one options object).
- Spec 032 (form states, R-69): `pipeline/form-step.ts` (every recorded state gets its form step
  and kind in `record_state`; steps persisted in `form_steps`), `run-path.ts` + `replay.ts` (the
  run's own path to each state, kept in `RunState.pathTo`; `reachState` replays it on a same-URL
  wizard, `REPLAY_DIVERGED` when it lands elsewhere), the `probe_form` tool:
  - `probe-form.ts`: form-probing runs only (`start_run form_probing`), marked steps only (`services/probe-marks.ts`, US5), gate,
    limit ≥ mutating, budget, the happy press, a 40 s limit per call with `more`; a try whose
    way back diverged is done once more in a new session (`fresh-session.ts`, F-03@038);
  - `probe.ts`: one press with values, a fault and an observation, classified and recorded in
    `probe_outcomes`;
  - `probe-steps.ts`: label steps for suites;
  - `fault.ts`: browser-side faults, also `act`'s `fault` in trace runs; error pages are kept
    while a fault is armed.

  BA: `services/ba/probe-suites.ts` (`propose_probe_suite`, suites stored `open`) and the
  `get_run_evidence` kind `probe_outcomes`. Spec 039 (T055): `services/ba/hypotheses.ts` (`list_deviations`,
  `list_hypotheses`, `get_hypothesis`, `propose_hypothesis`, `add_hypothesis_test` over
  `@pathfinder/store`'s `agent-hypotheses.ts`) and the crawler's `add_hypothesis`
  (`services/agent-notes.ts`; builds the portal model first when a run's portal has none).
  `find-again.ts` holds `findAgain` (moved out of `act.ts`).
- Spec 034 (R-70, documentation that grows): `services/ba/run-groups.ts` (runs grouped by the
  documented process whose screens they walked; same model as the dashboard's
  `queries_run_groups.py`, both checked against `tests/fixtures/run-groups/cases.json`),
  `process-update.ts` (`open_process_update`), `revision-guard.ts` (`revise_record` refuses
  silent drops of evidence or use-case steps, `REVISION_DROPS`; a process citing only error
  pages is refused, `PROCESS_ONLY_ERRORS`).
- Spec 034 (F-21, data pass): `services/ba/data-pass-check.ts` (`record_pass` for `data` returns
  `warnings`: form fields no data item names, terms the pages define that no glossary term names);
  `data-item-fields.ts` also refuses a data item named by a field's technical name.
- Spec 034 (R-66, map from a known screen): `services/checkpoints.ts` (every run stores its shortest
  path per state from `navigate`/`act` bookkeeping; `resolveRecipe`: a recorded direct visit, else
  the shortest checkpoint of the persona, else a path rebuilt from page visits; `NO_PATH`),
  `pipeline/go-to-state.ts` (the `go_to_state` tool: replays through `navigate`/`act`, checks
  each landing state, `REPLAY_DIVERGED`; `RunState.replay` keeps pages on the way out of the
  frontier and lifts the depth limit; the target gets depth 0), `services/run-plan.ts` (directed
  run types, `mayQueue`: Skip marks, a retry's one action, nothing in a recheck, a continue run's
  parent's done actions) and `run-plan-resolve.ts` (`start_run` `run_type` + `plan` → plan on the
  run row, `start_points`, marks used).
- Spec 037: `runtime/transit.ts` (R-62 Q3, learned transit zone: while `login` runs the navigation
  policy uses `loginScope` (any domain, only `disallowed` lists) and notes every non-portal host;
  a URL-only success does not count on a transit host; `keepTransitPage` keeps each provider page
  (masked snapshot, a screenshot unless a secret shows) and `markTransitHops` puts them on the
  landing visit's hops as `transit`; never states, never explored); `act` replays the run's path
  when a deep link misses the element (`RunState.replayOnly`, F-11@031); probes queue the tries
  on fields an option revealed (`pipeline/probe-form.ts` `runTries`, store helpers in
  `probe-records.ts`).
- Spec 038: `services/known-clusters.ts` (`seedKnownClusters`: per route, on first sight in a run,
  the run's fingerprint index gets the clusters earlier runs recorded, so a page that varies
  between runs is the next revision of its screen; `RunState.seededRoutes`); `services/shared-button.ts`
  (`inferSharedButton`: a banner/navigation/footer button whose earlier clicks all went to one
  other page is settled without a turn, `shared_button: <edge>`; `same-target.ts` `settleInferred`
  is shared); `services/link-path.ts` (an unnamed link's `link_to` and frontier description);
  unnamed fields carry `label` (from `@pathfinder/crawler` `withFieldLabels`) in results and
  `action_json`, and test data is looked up by it.
- Spec 039 (MudPuppy 2.0): `replay-driver.ts` (the headless driver: `replay(call, plan)` walks a
  recorded prefix by model element keys in a probe run, no LLM) and `replay-portal.ts`
  (`replayPortal`: R1 error replays, R8 rule mismatches, then boundary and regression tests, one
  budget; `pnpm model:replay`, `model:regress`) and `explore-process.ts` (`exploreProcess`: one
  pass of the stopping rule over a process, `pnpm model:explore`, T075). Probe runs (`runs.mode = 'probe'`, design § 9):
  `start_run` `mode: 'probe'` + `replay {inputs}` (`RunChoices.replay`, `RunState.headless`):
  element keys in results, autofill types the inputs first, transitions `driver = 'headless'`, no
  frontier drain. Not spec 032's form-probing runs (`form_probing`, T116@039).
- Entry points: `pnpm --filter @pathfinder/mcp-server start` (`src/main.ts`), `start:ba`.

## Invariants

- Tools are thin wrappers; logic in services (G-14).
- Code outside `runtime/` imports `runtime/index.js` only (G-12, ESLint `no-restricted-imports`).
- Every action and request is gated and recorded with evidence; refusals go through `refuse()`.
- Errors to the agent are `ToolError` codes (G-24).
- The order of pipeline steps, decision-log entries and trace spans is locked by
  `tests/pipeline-golden.e2e.test.ts`; a change that alters it must update the snapshot on purpose.

## Where to add things

- New MCP tool: G-14.
- New pipeline step: a file in `runtime/pipeline/`, a function taking the `StepContext`, wrapped in
  `step(sc, '<phase name>', …)` (the phase name must be in store's `PHASE_NAMES`), called from
  `process-page.ts` (G-18). The step returns `reported(value, [decision(…), event(…)])`; it never
  calls `ctx.decisions` or `ctx.tracer.event` (lint error). Unit-test its report builders like
  `tests/pipeline-reports.test.ts`.

## Tests

- `pnpm exec vitest run --project mcp-server` (from `apps/crawler`). Unit and service tests are fast
  tier; `*.e2e.test.ts` (whole runs with Chromium: insurer-*, map-run, trace-map-run, workspaces,
  capture, trace-run, trace-failure, pw-trace, pii-scrub, autofill, run-choices, shutdown,
  pipeline-golden) are slow tier: run `pnpm test:slow` before committing a `runtime/**` change.
- Harness: `tests/harness.ts`, `tests/mock-portal.ts`, `tests/mock-insurer.ts` (a change to them runs
  the whole fast tier).

## See also

- specs/001, 002, 004, 005, 009, 011, 012 (move-map.md), 013 (token usage); docs/code-guidelines.md (G-12, G-14,
  G-18, G-24)
