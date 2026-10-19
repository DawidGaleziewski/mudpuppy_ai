# @pathfinder/model

The portal model of MudPuppy 2.0 (spec 039, R-81): pure functions that turn Layer A evidence plus
recorded decisions into Layer M (screens, lineage, model transitions, coverage, build epochs),
deviations, rules R1–R8, decision tables and the planner. No database, browser or LLM
(Principle VII); `@pathfinder/store`'s `model-writer.ts` loads the inputs and writes the outputs.

Layer: models (G-07; `apps/crawler/layers.json`)

## Public API

- `defaults.ts`: `MODEL_DEFAULTS` (τ, LSH, global share, budgets, stopping rule).
- `capture/` (design § 5): `buildSignatures`, `scopeOf`, `isHashedAsset` (builds); `schemaHash`,
  `canonicalJson`; `stepResult`; `snapshotAt`, `typeValue`, `attributeName`, `ageOf`
  (attribute writes); `shownValues` (label–value pairs of a page).
- `model/` (design § 6–7): `clusterPartition`, `clusterPortal`, `lshCandidates`, `compare`
  (canonical clustering); `assignScreens`, `lineageFor` (stable ids); `parameterRoles`,
  `routeKey`, `paramsOf`, `dominantRouteKey`; `calibrateTau`, `labellingQueue` (T037);
  `globalKeys`, `foldTransitions`, `coverageOf`,
  `buildEpochs`; `reconcile` (the whole pure core).
- `interpret/` (design § 8, § 10): `deviationsBetween`, `classify` (rules R1–R8), `statusOf`
  (hypothesis lifecycle), `mayConfirm`, `claimHash`.
- `rules/` (design § 11): `outcomesFor`, `boundaryTests`, `toDmnXml`, `feel`; `replayInputs`,
  `birthDateFor` (what a boundary test types on the headless driver, design § 9).
- `plan/` (design § 13–14): `plan` (planner priorities), `correlationIds`, `endpointFamily`,
  `boundaryGraph` (process boundary weights), `explorationGaps`, `explorationBound`.

## Invariants

- Same inputs, same outputs, whatever the order (the order-independence, idempotence, rebuild and
  history-independence gates, design § 19.2; `tests/reconcile.test.ts`).
- Depends only on `@pathfinder/core`; never on the store or features.
- Thresholds and budgets come from `MODEL_DEFAULTS` or the portal hook, never a literal.
- Ties break on code-unit order (`compare`), never locale order.

## Tests

- `pnpm exec vitest run --project model` (from `apps/crawler`); tier: fast.

## See also

- specs/039-mudpuppy-2-portal-model/design.md, findings.md (F-01–F-15)
