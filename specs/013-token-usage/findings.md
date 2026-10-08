# Findings: spec 013 (R-24)

Every bug, gap and process slip found while building this feature: symptom, cause, fix commit or open, test/eval idea (see memory rule "log every bug for evals").

## Baseline (measured 2026-10-08 on master 2340823)

| Measure | Value |
| --- | --- |
| Scripted drain of the insurer mock (`mcp-server/tests/token-budget.e2e.test.ts`) | 6 states, 78 calls (38 get_next_frontier_item, 37 act, 1 navigate, 1 start_run, 1 finish_run), 89,422 result chars, re-read proxy 3,555,695 chars |
| Real Sonnet crawler drains of the reference portal (spec 010 F-16) | 372–407 tool calls, 37.9M–78.1M cache-read tokens, max context 357k–486k |
| BA reads of reference run 01a1083f-5472-7000-928b-af9441a68972 (`pnpm tokens:ba`): get_run_evidence edges | 7 calls / 109,761 chars |
| BA reads of reference run 01a1083f-5472-7000-928b-af9441a68972 (`pnpm tokens:ba`): get_run_evidence actions | 8 calls / 93,227 chars |
| BA reads of reference run 01a1083f-5472-7000-928b-af9441a68972 (`pnpm tokens:ba`): get_run_evidence decisions | 8 calls / 92,241 chars |
| BA reads of reference run 01a1083f-5472-7000-928b-af9441a68972 (`pnpm tokens:ba`): get_evidence state | 21 calls / 107,592 chars (elements 43,895; evidence content 44,379) |

## F-01 BA get_run_evidence actions rows return role and name as null (open, fixed in T014)

- **Symptom**: every `actions` item of `get_run_evidence` carries `role: null`, `name: null` next to `accessible_name`.
- **Cause**: `actionSummary()` in `apps/crawler/packages/mcp-server/src/services/ba/reads.ts` reads `role`/`accessible_name` from `action_json`, which for the actions table holds neither (they are columns), and its nulls overwrite the row's `role` column.
- **Fix**: T014.
- **Test/eval idea**: ba-reads test asserting an actions page item has the role and name of its row.

**Status**: fixed in T014 (`reads.ts` actions summary uses the row's `role` and `accessible_name`).
The BA has worked from these null roles since R-13; recheck documentation built on `actions`
pages when R-29 re-runs the BA eval.

## F-02 Strict transition schema refused the new `target_url` field (fixed)

- **Symptom**: after T006 every map-run `act` failed with `SCHEMA_INVALID: action: Unrecognized
  key: "target_url"`; the scripted drain looped 300 times on the first item (602 calls).
- **Cause**: `ActionInput` in `services/record-transition.ts` is `.strict()`; a new field in the
  issued action JSON has to be added there too. Nothing in the fast tier drives a real `act`.
- **Fix**: `target_url` added to `ActionInput`.
- **Test/eval idea**: a fast-tier test that feeds `issueActions`' JSON for a link through
  `ActionInput` (catches the next new field before the slow tier does). The token-budget e2e test
  now also fails on such a loop (calls ≤ 20).

## F-03 The golden run was capped before it drained (observation)

- **Symptom**: after US2 the golden map run on the mock portal records 50 edges instead of 39,
  with the same 7 states, 70 actions and 70 frontier rows. Every old (from, to, status) edge is
  still there; the 11 extra ones are inferred same-target links.
- **Cause**: the golden test drains with `crawl(…, 60)`; with one call per shared link the old
  run hit the 60-step cap with items still pending, so part of the frontier was never settled.
- **Fix**: none needed; snapshot updated on purpose (T009).
- **Test/eval idea**: the golden test could assert `get_next_frontier_item` is empty at the end,
  so a capped drain is visible instead of silently snapshotted.

## Results (2026-10-08)

| Measure | Before | After |
| --- | ---: | ---: |
| Scripted drain, insurer mock: states | 6 | 6 |
| Scripted drain: calls | 78 | 12 (−85 %) |
| Scripted drain: result chars | 89,422 | 16,308 (−82 %) |
| Scripted drain: re-read proxy | 3,555,695 | 109,213 (−97 %) |
| BA `get_evidence` state (21 calls) | 107,592 | 77,577 (−28 %) |
| BA `get_run_evidence` actions | 93,227 | 59,557 (−36 %) |
| BA `get_run_evidence` edges | 109,761 | 89,480 (−18 %) |
| BA `get_run_evidence` states | 5,053 | 4,066 (−20 %) |
| BA `get_run_evidence` decisions | 92,241 | 92,241 (on a new run: one merge decision per revisit, so US2 cuts them with the revisits) |

## Close-out review (T019, `code-reviewer`, 2026-10-08)

| # | Where | Guideline | Finding | Outcome |
| - | ----- | --------- | ------- | ------- |
| 1 | `runtime/pipeline/enqueue.ts` `targetUrl` | G-20 | exported but used only in its file (and a different `targetUrl` exists in `crawler/src/action-gate.ts`) | fixed: not exported |
| 2 | `mcp-server/CLAUDE.md` | G-30 | package notes missing `next-item.ts`, `same-target.ts`, the map-result shape and spec 013 | fixed |
| 3 | `services/ba/reads.ts` (529 counted lines, 517 on master) | G-01, G-06 | over the size limit; grew by 12 lines | deferred: split `RUN_EVIDENCE` + page compaction into their own file (follow-up) |
| 4 | `tools/index.ts` `registerTools`, `ba-tools/index.ts` `registerBaTools` | G-02 | functions over 80 lines (pre-existing) | deferred (follow-up) |
| 5 | `store/src/tracer.ts` `createTracer` | G-01, G-02 | pre-existing size warning; +2 lines | deferred (follow-up) |
| 6 | `ba-reads.test.ts`, `map-run.e2e.test.ts`, gates `findings.test.ts` | G-01 | test files over 400 lines (pre-existing) | deferred (follow-up) |

## Real-agent check (T018, SC-004, 2026-10-08)

Headless Sonnet crawler (`claude -p --agent crawler`, fresh workspace, new server code), map run
of `reference-insurer` as guest, run `01a11c37-9cb0-7000-9c87-9fb71832e3c4`:

| Measure | Baseline (spec 010 F-16, `01a1083f…`) | After |
| --- | ---: | ---: |
| Run status | completed | completed (frontier emptied) |
| States (route templates) | 21 | 21, identical list |
| Edges | 319 executed, observed | 319: 32 clicked (observed) + 287 inferred |
| Frontier skipped (`budget:max_depth`) | 35 | 35 |
| Agent turns / tool calls | 372–407 calls | 36 turns |
| Cache-read tokens | 37.9M–78.1M | **1.05M** (−97 % to −99 %) |
| Cache-write tokens | 0.36M–0.97M | 0.05M |
| Output tokens | 5.6k–7.6k | 6.1k |
| Wall time / cost | — | 2 min 43 s, $0.47 |

SC-004 met (target: same states at < 25 % of the cache reads).

## F-04 finish_run counted inferred links as executed (fixed)

- **Symptom**: the real crawler reported "319 actions executed" although only 32 were clicked.
- **Cause**: `computeCoverage` (`crawler/src/report.ts`) counts every edge with status
  `executed`; inferred same-target edges carry that status too (plan R4).
- **Fix**: `actions_executed` counts observed edges only; new `actions_inferred`; the frontier
  report prints "Links inferred (target already reached)".
- **Test/eval idea**: token-budget e2e asserts `coverage.actions_inferred` equals the inferred
  edges (added); an eval check that executed + inferred equals the frontier's done items.
