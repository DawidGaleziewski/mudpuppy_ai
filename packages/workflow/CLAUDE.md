# @pathfinder/workflow

Pure functions from recorded data to workflow step statuses, next moves and amendment impact (R-30).

Layer: features (G-07; `apps/crawler/layers.json`)

## Public API
- `state.ts`: workflow step status and next-move computation; used by apps/chat.
- `amendments.ts`: amendment impact analysis; used by apps/chat.

## Invariants
- Pure (no I/O, no browser, no LLM).
- Works from recorded Pathfinder data (core records, runs, docs).

## Where to add things
- New workflow logic: `src/state.ts` or `src/amendments.ts` following existing patterns.
- New functions: export from `src/index.ts`.

## Tests
- `pnpm --dir packages/workflow test`; tier: fast.

## See also
- specs/010-acp-chat-orchestrator
- docs/code-guidelines.md
