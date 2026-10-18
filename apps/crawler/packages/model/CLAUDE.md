# @pathfinder/model

The portal model of MudPuppy 2.0 (spec 039, R-81): pure functions that turn Layer A evidence plus
recorded decisions into Layer M (screens, lineage, model transitions, coverage, build epochs),
deviations, rules R1–R8 and the planner. No database, browser or LLM (Principle VII); the store's
model writer loads the inputs and writes the outputs.

Layer: models (G-07; `apps/crawler/layers.json`)

## Public API

- `MODEL_DEFAULTS` (`defaults.ts`): every starting value (τ, LSH, global share, budgets, stopping rule).
- More lands per milestone (spec 039 tasks M1–M5).

## Invariants

- Same inputs, same outputs, whatever the order (the order-independence, idempotence, rebuild and
  history-independence gates, design § 19.2).
- Depends only on `@pathfinder/core` and the kernel; never on the store or features.
- Thresholds and budgets come from `MODEL_DEFAULTS` or the portal hook, never a literal.

## Tests

- `pnpm exec vitest run --project model` (from `apps/crawler`); tier: fast.

## See also

- specs/039-mudpuppy-2-portal-model/design.md
