# @pathfinder/core

The kernel: the crawl model's Zod schemas and the small pure building blocks every package uses
(ids, PII scrubber, evidence store, element keys, layout, secrets redactor, zip, pino logger).

Layer: kernel (G-07; `apps/crawler/layers.json`). DB code lives in `@pathfinder/store`.

## Public API
- Crawl-model schemas in `src/schemas/` (run, state, action, edge, form, frontier, decision log,
  network call, open question, rule candidate, robots policy, portal data log, page visit and
  navigation hop (spec 019), common enums).
  Trace, documentation and chat schemas live in `@pathfinder/trace`, `docs-model`, `chat-model`.
- `newId`, `nowIso` (`ids.ts`), `maskText`, `scrubJson` (`pii.ts`), `createEvidenceStore`
  (`evidence.ts`), element keys and `buildLayout` (`element-key.ts`, `layout.ts`).
- `createRedactor`, `SECRETS` (`secrets.ts`; re-exported by vault, used by apps/chat
  `error-log.ts`), `createLogger` (`log.ts`), `zip`/`unzip`/`redactZip`.
- Used by nearly every package.

## Invariants
- No `@pathfinder/*` dependency, no DB, no browser, no LLM (G-08; `tests/layers.test.ts`).
- Schemas are the single source of truth (Zod); a schema moves here only when two unrelated
  features need it and it describes the crawl model (G-09).

## Where to add things
- New crawl-model schema: `src/schemas/<name>.ts` + `src/schemas/index.ts`. A feature's schema
  goes to its model package instead (G-09, G-10).
- New table/column: `db-admin` agent; table types live in `@pathfinder/store` (G-16).

## Tests
- `pnpm exec vitest run --project core` (from `apps/crawler`); tier: fast. Fixtures in
  `tests/fixtures/`.

## See also
- specs/001-crawler-map-mode, specs/012-maintainability (move-map.md), docs/code-guidelines.md
  (G-07..G-11)
