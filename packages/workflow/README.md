# @pathfinder/workflow

Shared, pure (no I/O) functions that turn recorded Pathfinder data into workflow step statuses, valid next moves and amendment impact (roadmap item R-30). Used by `apps/chat`. See `specs/010-acp-chat-orchestrator/`.

Currently a scaffold: strict TypeScript, ESLint, Vitest, `src/` and `tests/`.

## Checks

Run from this folder after `pnpm install` at the repo root:

```
pnpm typecheck && pnpm lint && pnpm test
```
