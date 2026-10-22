# @mudpuppy/docs-model

The documentation model: Zod schemas of everything the BA agent records (records, revisions and
their content per kind, relations, reviews, evidence links, analysis sessions, follow-up tasks)
and of traced processes and their steps.

Layer: models (G-07; `apps/crawler/layers.json`)

## Public API

- `DocRecord`, `DocKind`, `KEY_PREFIX`; `DocRevision`, `DocContent`, `DOC_CONTENT_BY_KIND` and the
  per-kind content schemas; `DocRelation`, `DocReview`, `DocEvidenceLink`; `AnalysisSession`,
  `AnalysisPass`; `FollowupTask`; `Process`, `ProcessStep` and their status/kind enums.
- Used by: docs, mcp-server (BA tools, trace mode), store (`db-types.ts` enums).

## Invariants

- Schemas only: no DB, no IO, no logic beyond validation.
- Enums equal the CHECK lists in `data/schema/schema.sql` (`tests/schemas.test.ts`); Zod is the
  source of truth (constitution).

## Where to add things

- New record kind: `DocKind`, `KEY_PREFIX` and a content schema in `src/schemas/doc-content.ts`
  (+ `DOC_CONTENT_BY_KIND`), the migration via `db-admin`, then the renderer in `@mudpuppy/docs`.

## Tests

- `pnpm exec vitest run --project docs-model` (from `apps/crawler`); tier: fast.

## See also

- specs/004-ba-documentation, specs/012-maintainability (move-map.md), docs/code-guidelines.md
  (G-09, G-16)
