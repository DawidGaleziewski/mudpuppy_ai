# @pathfinder/store

SQLite access through Kysely and the two DB writers every server shares: the decision log and the
tracer.

Layer: store (G-07; `apps/crawler/layers.json`)

## Public API

- `openDb`, `dbPathFor`, `applyPragmas`, `PathfinderDb`, `OpenedDb` (`db.ts`); `Database` and every
  `*Table` type (`db-types.ts`, mirrors `data/schema/schema.sql`); `Selectable`, `Insertable`.
- `migrateUp`, `migrateDown`, `loadMigrations`, `appliedVersions` (`migrate.ts`; the SQL lives in
  `data/migrations/` at the repo root).
- `createDecisionLog`, `linkDecisions` (`decision-log.ts`): writes `decision_log`, mirrors to pino
  and emits a tracer `decision` event.
- `createTracer`, `emitForRun`, span/phase/event vocabulary (`tracer.ts`): writes `trace_spans`.
- `importAgent` (`import-agent.ts`): imports a crawler subagent transcript (`pnpm trace:import-agent`).
- `auditPii`, `compareRuns` (`audit.ts`), portal export/delete (`portal-data.ts`, every portal
  table incl. `page_visits`, spec 019), `secretsPlugin`.
- `planStoreReset`, `applyStoreReset`, `openHolders`, `answeringPorts` (`store-reset.ts`): the
  MudPuppy 2.0 data reset (`pnpm store:reset [--confirm]`, spec 039 T002).
- Spec 039 portal model: `reconcilePortalModel` (`model-writer.ts`), `interpretVersion`
  (`interpret-writer.ts`), `decideHypothesis`, `labelPair`, `setParameterRole` (`model-decide.ts`),
  `loadObservationTables`, `importMinedRule` (`rule-mining.ts`, `pnpm model:mine`),
  `processGraph`, `writeProposals` (`process-proposals.ts`, `pnpm model:propose`),
  `pendingReplays`, `recordReplay`, `judgeReplays` (`replay-tests.ts`, `pnpm model:replay`),
  `pendingErrorReplays`, `resolveErrorReplays` (`error-replays.ts`, rule R1 on the driver),
  `decisionRules`, `dmnFiles` (`rule-export.ts`, `pnpm model:dmn`), `queueRegressions`,
  `recordRuleMismatches`, `pendingMismatchReplays`, `resolveRuleMismatch` (`regressions.ts`,
  decision drift by R8, `pnpm model:regress`), `pairsToLabel`, `tauCalibration`, `calibratedTau`
  (`model-calibration.ts`, the labelling queue and τ, `pnpm model:pairs`).
- Used by: mcp-server, crawler, docs, gates, vault, apps/chat, the crawler app scripts.

## Invariants

- Depends only on `@pathfinder/core` and the model packages below it, never on features.
- Table types match `data/schema/schema.sql`; a new table or column goes through the `db-admin`
  agent (G-16); the dashboard's drift test compares its models with the schema.
- Every write passes the secrets plugin (registered credentials never reach the DB, spec 009).
- A failing trace write never breaks the crawl (spec 005 FR-014): the tracer counts it in health.

## Where to add things

- New table type: `src/db-types.ts` (with the migration, via `db-admin`).
- New tracer event or phase name: `EVENT_NAMES`/`PHASE_NAMES` in `src/tracer.ts` and the vocabulary in
  `specs/005-crawl-run-observability-trace/contracts/trace-spans.md`.

## Tests

- `pnpm exec vitest run --project store` (from `apps/crawler`); tier: fast. Migrations from
  `data/migrations/`; transcript fixture in `../core/tests/fixtures/`.

## See also

- specs/001-crawler-map-mode, specs/005-crawl-run-observability-trace, specs/012-maintainability
  (move-map.md), docs/code-guidelines.md (G-07, G-16)
