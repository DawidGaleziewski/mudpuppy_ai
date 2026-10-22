# @mudpuppy/mcp-server

The `mudpuppy` stdio MCP server (the crawler agent's only tools: start_run, navigate, act, probe_form, login,
get_known_states, get_next_frontier_item, add_open_question, add_hypothesis, finish_run) and the
`mudpuppy-ba` server (BA tools: `src/ba-server.ts`, `src/ba-tools/`, `src/services/ba/`).

Layer: servers (G-07; `apps/crawler/layers.json`)

## Layout

- `src/tools/index.ts`: tool shapes and descriptions; `src/services/*.ts`: the logic per tool
  (`services/ba/` for the BA server).
- `src/runtime/`: the browser runtime; `runtime/pipeline/` is the crawl pipeline, one file per
  step or tool, run in order by `process-page.ts` on one `StepContext`.
- `server-context.ts` (`openServerContext`), `boot-environment.ts` (`MUDPUPPY_ENV`, no default),
  `local-client.ts` + `trace-driver.ts` (`pnpm portal:trace`), `replay-driver.ts` (the headless
  driver of MudPuppy 2.0, no LLM).
- Entry points: `pnpm --filter @mudpuppy/mcp-server start` (`src/main.ts`), `start:ba`.
- **Where each feature lives, by spec: `LAYOUT.md`.** Read it before changing a tool or step.

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
- A new file: add its line to `LAYOUT.md`.

## Tests

- `pnpm exec vitest run --project mcp-server` (from `apps/crawler`). Unit and service tests are fast
  tier; `*.e2e.test.ts` (whole runs with Chromium) are slow tier: run `pnpm test:slow` before
  committing a `runtime/**` change.
- Harness: `tests/harness.ts`, `tests/mock-portal.ts`, `tests/mock-insurer.ts` (a change to them runs
  the whole fast tier).

## See also

- `LAYOUT.md`; specs/001, 002, 004, 005, 009, 011, 012 (move-map.md), 013 (token usage);
  docs/code-guidelines.md (G-12, G-14, G-18, G-24)
