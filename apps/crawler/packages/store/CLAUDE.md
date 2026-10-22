# @mudpuppy/store

SQLite access through Kysely and the two DB writers every server shares: the decision log and the
tracer.

Layer: store (G-07; `apps/crawler/layers.json`)

## Public API

- `openDb`, `dbPathFor`, `applyPragmas`, `MudPuppyDb`, `OpenedDb` (`db.ts`); `Database` and every
  `*Table` type (`db-types.ts`, one file per table family); `migrateUp`, `migrateDown`
  (`migrate.ts`; the SQL lives in `data/migrations/` at the repo root).
- `createDecisionLog` (`decision-log.ts`) and `createTracer`, `emitForRun` (`tracer.ts`; the
  vocabulary in `tracer-types.ts`).
- Portal export/delete (`portal-data.ts`, `portal-tables.ts`), the 2.0 data reset
  (`store-reset.ts`), typed evidence references (`entity-refs.ts`).
- The portal model's writers and reads (spec 039, 040): `reconcilePortalModel` and the rest.
- **What each module exports, by spec: `LAYOUT.md`.** Read it before adding to the package.
- Used by: mcp-server, crawler, docs, gates, vault, apps/chat, the crawler app scripts.

## Invariants

- Depends only on `@mudpuppy/core` and the model packages below it, never on features.
- Table types match `data/schema/schema.sql`; a new table or column goes through the `db-admin`
  agent (G-16); the dashboard's drift test compares its models with the schema.
- Every write passes the secrets plugin (registered credentials never reach the DB, spec 009).
- A failing trace write never breaks the crawl (spec 005 FR-014): the tracer counts it in health.

## Where to add things

- New table type: its family's `src/db-types-<family>.ts` (crawl, evidence, model, docs, chat,
  trace) and the `Database` map in `src/db-types.ts` (with the migration, via `db-admin`).
- New tracer event or phase name: `EVENT_NAMES`/`PHASE_NAMES` in `src/tracer-types.ts` and the vocabulary in
  `specs/005-crawl-run-observability-trace/contracts/trace-spans.md`.
- A new module: export it from `src/index.ts` and add its line to `LAYOUT.md`.

## Tests

- `pnpm exec vitest run --project store` (from `apps/crawler`); tier: fast. Migrations from
  `data/migrations/`; transcript fixture in `../core/tests/fixtures/`.

## See also

- `LAYOUT.md`; specs/001-crawler-map-mode, specs/005-crawl-run-observability-trace,
  specs/012-maintainability (move-map.md), docs/code-guidelines.md (G-07, G-16)
