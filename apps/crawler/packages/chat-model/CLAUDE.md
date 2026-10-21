# @pathfinder/chat-model

The chat model (G-10): Zod schemas of chat conversations and messages, workflow steps, the BA's
process scope and amendments.

Layer: models (G-07; `apps/crawler/layers.json`)

## Public API

- `ChatConversation`, `ChatMessage` (+ status/role enums), `WorkflowStep` (+ `WorkflowStepName`,
  `WorkflowStepStatus`), `ProcessScope` (+ `ProcessScopeSource`), `Amendment` (+ kind, status,
  target kind, superseded reason, anchor element), `ChatProposal` (+ `ChatProposalStatus`,
  `ChatProposalTargetKind`; 0017), the BA process tables of 0018 (`BaProcess`, `BaProcessRevision`,
  `ProcessModel`, `ProcessModelRevision` (0039: were `ProcessVariant*`), `ProcessStep`, `ProcessDraft`, `ProcessLive`,
  `GroupingSuggestion`, `ChangeSpecRevision` + enums).
- Used by: apps/chat, store (`db-types.ts` enums).

## Invariants

- Schemas only: no DB, no IO.
- Enums equal the CHECK lists of migrations 0008 and 0010 (`tests/schemas.test.ts`).

## Where to add things

- New workflow step or chat table field: the schema here, the migration via `db-admin`, the table
  type in `store/src/db-types.ts`, then `packages/workflow` / `apps/chat`.

## Tests

- `pnpm exec vitest run --project chat-model` (from `apps/crawler`); tier: fast.

## See also

- specs/010-acp-chat-orchestrator, specs/011-portal-onboarding, specs/012-maintainability
  (move-map.md), docs/code-guidelines.md (G-10)
