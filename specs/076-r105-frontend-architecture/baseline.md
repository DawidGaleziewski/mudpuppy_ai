# Baseline before the refactor (2026-10-24, master v2.9.0 = ca4ccce0)

Owner's budget for the evals: $10. Spent **$8.01** (crawler eval $7.53, its judge $0.05, grouping
eval $0.43).

## Tests

| Suite | Result |
|---|---|
| `apps/crawler` `pnpm test` (everything, gates included) | 307 files, 2519 passed, 5 skipped; perf 2 passed |
| `apps/chat` typecheck, lint, test | 380 passed |
| `apps/chat` `test:e2e` (browser) | 8 of 8 |
| `apps/web` typecheck, lint, test | 214 passed |
| `apps/dashboard` ruff, pytest (parallel, then perf and serial) | green |
| `packages/workflow` | 29 passed |
| `apps/proving-ground/backend` ruff, pytest | green |

## Evals

**Crawler eval** (`pnpm eval reference-insurer`, one trial; result
`data/evals/reference-insurer/2026-10-24T08-20-33-511Z.json`): every agent `success` (crawler, form
probing, BA, BA traces, four process traces); **no regression** against the baseline; $7.53,
10.9 M tokens, 25 min.

| Score | Baseline | This trial |
|---|---|---|
| screens, terms, fields, crawl_screens | 100 | 100 |
| constraints | 98.1 | 100 |
| rules | 76.5 | 76.5 |
| processes, processes_map | 80 | 80 |
| process_trace_steps | 90.9 | 90.9 |
| process_variants | 100 | 100 |
| export_ears | 72.2 | 94.7 |
| export_* (actions, apis, fields, steps, validation …) | 100 | 100 |
| overclaims | 0 | 0 |
| judge glossary-terms (uncalibrated) | — | 10/10 |

**Grouping eval** (`pnpm --dir apps/chat eval reference-insurer --budget-usd 2`; result
`data/evals/grouping-reference-insurer/2026-10-24T08-46-55-761Z.json`): processes_found 4 of 5
(80 %), clean_starts 4 of 4, why_cites 4 of 4; no duplicates, stubs, extra screens or error screens;
$0.43, 40 s.

The refactor changes the console and its checks only (no crawler, BA or assistant code that the
evals exercise), so the evals are not run again after it; the suites are.
