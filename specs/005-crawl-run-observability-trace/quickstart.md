# Quickstart: Crawl Run Observability Trace

Validation guide for R-17. Details in [contracts/](contracts/) and [data-model.md](data-model.md).

## Prerequisites

- `apps/crawler`: `pnpm install`. Migration `0003_trace` is applied automatically when the MCP
  server or a test opens a store (`migrateUp`).
- `apps/dashboard`: `uv sync`.
- Browser e2e tests need Chromium's system libraries (`pnpm exec playwright install-deps chromium`);
  without them they skip (`canLaunchBrowser()`), exactly like `map-run.test.ts`. On this WSL host the
  libraries were missing on 2026-09-25 (roadmap notes) — install them before step 3.
- Claude Code ≥ 2.1.283 for `_meta` tool-use ids.

## Automated checks

```bash
cd apps/crawler
pnpm typecheck && pnpm lint && pnpm test
pnpm audit:pii            # extended to trace_spans and agent_turns (SC-006)

cd ../dashboard
uv run pytest && uv run ruff check . && uv run ruff format --check .
```

Key tests: `trace-calls.test.ts` (every tool → one call span, `_meta`, statuses, run-less calls),
`trace-map-run.test.ts` (mock portal: phases sum within 5%, every `decision_log` row linked once,
robots checks per occurrence, stabilization diagnostics), `trace-golden.test.ts` (SC-007),
`trace-failure.test.ts` (FR-014), core `transcript`/`join` fixture tests, dashboard `test_perf.py`
on a 20 000-span store (SC-005).

## Manual scenarios

1. **Replay a run (US1)**: start the MCP server for `sandbox`, run the `crawler` agent on a
   sandbox portal for ~10 steps. Open `/runs/<id>?tab=trace`: calls in order, each with rationale,
   status, duration; expand one `act` → phases whose bar fills the call; events inside.
2. **Interrupted call (US1 #3)**: kill the MCP server during a `navigate`; restart; the call shows
   `unfinished`, earlier calls complete.
3. **Safety proof (US2)**: filter `status=refused`; each refusal shows class, rule, reason; expand
   → `gate_decision` and linked `decision`. `SELECT count(*) FROM decision_log WHERE run_id=?`
   equals `SELECT count(*) FROM trace_spans WHERE run_id=? AND name='decision'`.
4. **Run-less call (US1 #4)**: call `start_run` for a production portal without compliance
   sign-off; `/activity` shows it with the preflight error.
5. **Agent side (US3)**: when the crawler agent finishes, the `SubagentStop` hook imports its
   transcript (stdout JSON in the hook log). The trace shows agent text and tokens per call;
   `SELECT count(*) FROM agent_turns WHERE kind='tool_use' AND tool_name LIKE 'mcp__pathfinder__%'
   AND matched=0` is 0 unless a call was blocked client-side. Re-run
   `pnpm trace:import-agent --agent-id <id>`: row count unchanged.
6. **Never stabilized (US4 #2)**: on the mock portal page that polls forever, the `settle` phase
   has a `stabilization_timeout` event naming the polling request pattern.
7. **Browser trace (US4 #4)**: on a sandbox run, copy the command from an expanded call and open it:
   `npx playwright show-trace data/traces/<portal>/<run>/<seq>-act.zip`. On a production portal no
   zip is written unless the server ran with `PATHFINDER_PW_TRACE=1`.
8. **Long run (US5)**: open the 20 000-span fixture store (`--env perf`); summary and first page
   under 1 s; "problems only" narrows the list.
9. **Portal delete (FR-013)**: `pnpm portal:delete <portal>` removes that portal's spans, agent
   turns and `data/traces/<portal>/`; `pnpm portal:export <portal>` contains spans and turns but no
   zips.
10. **No trace (edge case)**: a pre-feature run shows the "no trace recorded" state.
