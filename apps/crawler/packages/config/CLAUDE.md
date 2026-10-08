# @pathfinder/config

Loads and validates portal and persona YAML with Zod, resolves extends, computes the effective config.

Layer: models (G-07)

## Public API
Used by: mcp-server, crawler, safety, vault, gates, apps/chat (`src/index.ts` re-exports all).
- `load-portal`, `load-persona`: load and validate the YAML files (`loadPersona` also in the vault CLI).
- `effective`: the effective config after `extends` resolution.
- `portal-schema`, `persona-schema`: the Zod schemas.
- `secrets`, `rule-ids`, `errors`: persona secret refs, portal rule ids, config error types.

## Invariants
- No browser, no LLM; reads files, never writes.
- Selectors and rules come from config, never from code (portal-agnostic).
- Unknown keys are errors (strict Zod).

## Where to add things
- New portal field: `src/portal-schema.ts`, test in `tests/`.
- New persona field: `src/persona-schema.ts`.

## Tests
- `pnpm exec vitest run --project config`; tier: fast. Fixtures in `tests/`.

## See also
- specs/002-portal-agnostic-safety, specs/009-legacy-proving-ground
- docs/code-guidelines.md (G-07)
