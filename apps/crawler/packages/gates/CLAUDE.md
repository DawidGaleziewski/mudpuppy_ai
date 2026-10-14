# @pathfinder/gates

Tier-1 quality gates (one case per legacy obstacle and logged finding) against the proving ground, and tier-2 eval tooling (spec 009 R-27). Exports: catalogue, gate, gap, harness, paths, steps, eval, eval-checks.

Layer: servers (G-07; `apps/crawler/layers.json`)

## Public API

- `gate()`, `gap()`: define gate and known-unfixed cases; used by the crawler app root.
- `catalogue`, `harness`, `paths`, `steps`, `eval`: gate infrastructure and reporting. `eval`
  holds `EvalResult` (with `conditions`: `session_timeout_s`, `crawler_only`, `process_traces`;
  optional `workspace` and `judges`, spec 017; `runs.process_traces`, spec 025), `compareEval` and `Tolerances`, used by
  `apps/crawler/evals/`. `judges` (`JudgeRunResult`) are printed, never compared.
- `eval-checks` (`crawlScreens`, `passwordHits`, `widgetActions`) and `HARD_ZERO_CHECKS`: pure
  eval measures used by `apps/crawler/evals/` (spec 014). Their tests (`tests/eval-*.test.ts`) need no
  estate and run in the root `repo` project, fast tier (spec 014 F-03, spec 020 T001).

## Invariants

- Files run one at a time (`fileParallelism: false`); shared estate on ports 4200/4201.
- `src/global-setup.ts` starts the proving ground.
- Slow cases run only with `PATHFINDER_SLOW_GATES=1` (`pnpm test:slow`).

## Where to add things

- New gate case: G-17 (`gate('<id>', …)`); known unfixed: `gap()`.

## Tests

- Tier: gates (in `pnpm test:slow` and `pnpm test`, never in `test:fast`), except the pure
  `tests/eval-*.test.ts`, which run in the fast tier. Stop anything on 4200/4201 first.
- Report in `data/gates/`.

## See also

- specs/009-legacy-proving-ground
- docs/code-guidelines.md (G-17)
