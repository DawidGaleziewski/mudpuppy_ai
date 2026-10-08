# @pathfinder/gates

Tier-1 quality gates (one case per legacy obstacle and logged finding) against the proving ground, and tier-2 eval tooling (spec 009 R-27). Exports: catalogue, gate, gap, harness, paths, steps, eval.

Layer: servers (G-07; `apps/crawler/layers.json`)

## Public API
- `gate()`, `gap()`: define gate and known-unfixed cases; used by the crawler app root.
- `catalogue`, `harness`, `paths`, `steps`, `eval`: gate infrastructure and reporting.

## Invariants
- Files run one at a time (`fileParallelism: false`); shared estate on ports 4200/4201.
- `src/global-setup.ts` starts the proving ground.
- Slow cases run only with `PATHFINDER_SLOW_GATES=1` (`pnpm test:slow`).

## Where to add things
- New gate case: G-17 (`gate('<id>', …)`); known unfixed: `gap()`.

## Tests
- Tier: gates (in `pnpm test:slow` and `pnpm test`, never in `test:fast`). Stop anything on 4200/4201 first.
- Report in `data/gates/`.

## See also
- specs/009-legacy-proving-ground
- docs/code-guidelines.md (G-17)
