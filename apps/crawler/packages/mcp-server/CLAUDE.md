# @pathfinder/mcp-server

The `pathfinder` stdio MCP server (the crawler agent's only tools: start_run, navigate, act, login,
get_known_states, get_next_frontier_item, add_open_question, add_rule_candidate, finish_run) and the
`pathfinder-ba` server (BA tools: `src/ba-server.ts`, `src/ba-tools/`, `src/services/ba/`).

Layer: servers (G-07; `apps/crawler/layers.json`)

## Layout

- `src/tools/index.ts`: tool shapes and descriptions; `src/services/*.ts`: the logic per tool.
- `src/runtime/`: the browser runtime. `browser-runtime.ts` owns sessions; `runtime/pipeline/` is
  the crawl pipeline, one file per step or tool:
  - `process-page.ts`: the ordered steps for an observed page (`settle` → `observe` → `net_drain` →
    `fingerprint-step` → `record-state` → visuals → CAPTCHA hand-off → depth → `record-page`
    forms/transition → network → `record_visit` → `enqueue` → trace step) on one `StepContext`.
    `settle` waits through client redirects and for mounts in every frame read; `visits.ts`
    stores the page visit (spec 019); `observe` reads frames (`frames.ts`); `composition.ts`
    builds the page composition (spec 015).
  - `navigate.ts`, `act.ts` (+ `act-gate.ts`), `login-step.ts`, `relogin.ts`, `trace-boundary.ts`:
    the tool entry points; `gate.ts` (gate context, item cap, `refuse`), `stop.ts` (begin step,
    persist stop, bookkeeping), `actions.ts` (issued action rows, input values), `next-item.ts`
    (`withNext`: map-mode results carry the next frontier item, spec 013).
  - Map-mode results omit `actions` on a revisited state (`actions_omitted`; tests that read
    them pass `include_actions`). `index.ts` re-exports only the tool entry points and helpers.
- `src/services/frontier.ts` + `same-target.ts`: link items whose target the run already reached
  become `inferred` edges (spec 013 US2). BA reads: `services/ba/reads.ts`, `run-evidence.ts`
  (`get_run_evidence`, incl. `page_visits`, `parameters`, spec 019).
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
