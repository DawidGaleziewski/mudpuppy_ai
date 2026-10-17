# @pathfinder/docs

Layer B documentation core for the BA agent: record keys, status engine, relations, observed
rules, evidence resolution, audit, review, SRS rendering (Mermaid), export, process scope,
evaluation against a ground truth.

Layer: features (G-07; `apps/crawler/layers.json`). Depends on core, docs-model (the record
schemas) and store (record keys are allocated in the DB, `src/keys.ts`).

## Public API

- Record keys and status engine; used by mcp-server (BA tools), gates, apps/chat.
- Relations, observed rules, evidence resolution; used by mcp-server.
- Spec 019: `parameterInventory` (`param-inventory.ts`, URL parameters and entry URLs per state,
  pure; `render/screen-urls.ts` puts them in the export) and `describeRecordKinds` /
  `describeRelations` (`record-kinds-text.ts`, the BA's write contract as text, from the schemas).
- SRS rendering (`src/render/`; a screen lists its data items, terms shown and processes through
  it from `appears_on` / `contains`, spec 028), audit, review, export, process scope, evaluation; used by the
  crawler app scripts (`pnpm docs:*`). `readGroundTruth()` reads a YAML ground truth (G-34); used
  by `apps/crawler/evals/`, `docs:evaluate` and the gates.
- Spec 034 (R-68, rebuild-grade export): `src/process-export/` — `steps.ts`
  (`resolveProcessSteps`: a PROC record's steps from its trace, trace steps or chained edges, a
  PRC's from A's head; states collapsed per kind and form step), `contracts.ts` (API calls per
  step, noise, OpenAPI from shapes), `model.ts`, the renderers (`render-steps.ts`,
  `render-records.ts`, `render-contracts.ts`) and `index.ts` (`exportProcess`, `exportPortal`);
  used by `pnpm docs:process-export` and the dashboard's process tabs. Layout = the owner-rated
  mocks in `specs/034-…/mocks/`.
- Test helpers in `src/testing/` (a migrated scratch store, record fixtures).

## Invariants

- No browser, no LLM: functions over recorded data; DB access only through `@pathfinder/store`.
- Every documentation record cites evidence.
- Record schemas live in `@pathfinder/docs-model`, not here (G-09).

## Where to add things

- New record kind or relation: the schema in `docs-model`, then the logic and rendering here.
- New rendering format: `src/render/`.

## Tests

- `pnpm exec vitest run --project docs` (from `apps/crawler`); tier: fast.

## See also

- specs/004-ba-documentation, docs/code-guidelines.md (G-09)
