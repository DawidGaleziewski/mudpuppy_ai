# Move map: `@pathfinder/core` split (spec 012 T023)

Decided 2026-10-07 from the code (research R6 open point). The tracer writes `trace_spans`
directly through Kysely (`core/src/trace/tracer.ts` takes a `PathfinderDb`), and `log.ts`'s
decision log writes `decision_log` and emits tracer events. So both DB writers go to the
**store** layer with the DB code; the pure trace parts (schemas, scrubbing, limits, URL shaping,
transcript parsing and joining) form the `trace` model package. This keeps G-07 (`trace` in
models) and avoids a `store` ↔ `trace` cycle. `apps/crawler/layers.json` holds the layers;
`apps/crawler/tests/layers.test.ts` enforces them.

| Layer | Package | Holds |
| --- | --- | --- |
| kernel | `@pathfinder/core` | ids, PII scrubber, evidence store, element keys, layout, secrets redactor, zip, `createLogger` (pino), crawl-model schemas (action, common, decision-log, edge, form, frontier, network-call, open-question, portal-data-log, robots-policy, rule-candidate, run, state) |
| models | `@pathfinder/trace` (new) | trace schemas (trace-span, trace-boot, agent-turn) + pure trace helpers |
| models | `@pathfinder/docs-model` (new) | documentation schemas (doc-*, evidence-link, analysis-session, followup-task, process, process-step) |
| models | `@pathfinder/chat-model` (new) | chat schemas (chat-conversation, workflow-step, process-scope, amendment) — G-10 |
| store | `@pathfinder/store` (new) | `db`, `db-types`, `migrate`, `audit`, `portal-data`, `secrets-plugin`, decision log, tracer, agent-transcript import |

Order (one green commit each): **A** store → **B** trace → **C** docs-model → **D** chat-model.
Each step: create the package, `git mv` the files and their tests, fix the moved files' own
imports, update every importer's `import { … } from '@pathfinder/core'` (split the import: moved
names from the new package, the rest stay), add the dependency to the importer's `package.json`,
`pnpm install` at the repo root, typecheck, all tiers. No re-export shims from core (G-11). No
change under `data/migrations/` or `data/schema/`.

## A. `@pathfinder/store` (`apps/crawler/packages/store/`)

| From `core/src/` | To `store/src/` | Exported names |
| --- | --- | --- |
| `db.ts` | `db.ts` | `OpenedDb PathfinderDb applyPragmas dbPathFor openDb` |
| `db-types.ts` | `db-types.ts` | every `*Table` type, `Database` |
| `migrate.ts` | `migrate.ts` | `Migration appliedVersions loadMigrations migrateDown migrateUp` |
| `audit.ts` | `audit.ts` | `PiiFinding StabilityReport auditPii compareRuns` |
| `portal-data.ts` | `portal-data.ts` | `DeletePlan ExportOptions PORTAL_TABLES PortalDataError PortalTable RowCounts deletePortal exportPortal planPortalDelete where` |
| `secrets-plugin.ts` | `secrets-plugin.ts` | `secretsPlugin` |
| `log.ts` (decision-log part) | `decision-log.ts` | `DecisionInput DecisionLog createDecisionLog linkDecisions` (`createLogger` stays in core `log.ts`) |
| `trace/tracer.ts` | `tracer.ts` | `Attrs BROWSER_TOOLS CallInfo CallStart EVENT_NAMES EventName EventOpts PHASE_NAMES PhaseName SpanHandle TraceHealth Tracer TracerDeps createTracer emitForRun` |
| `trace/import-agent.ts` | `import-agent.ts` | `ImportAgentOptions ImportAgentResult StoreImportResult importAgent` |
| core `index.ts` type re-exports | store `index.ts` | `Selectable`, `Insertable` (kysely) |

Tests moving with them: `audit`, `db`, `log` (decision-log cases), `portal-data`, `secrets`
(DB plugin cases), `trace-import-agent`, `tracer`.

## B. `@pathfinder/trace` (`apps/crawler/packages/trace/`)

| From `core/src/` | To `trace/src/` | Exported names |
| --- | --- | --- |
| `schemas/trace-span.ts` | `schemas/trace-span.ts` | `AttrsJson SpanKind SpanStatus TraceSpan` |
| `schemas/trace-boot.ts` | `schemas/trace-boot.ts` | `PwTraceMode TraceBoot TraceLevel TraceServer` |
| `schemas/agent-turn.ts` | `schemas/agent-turn.ts` | `AgentTurn AgentTurnKind AgentTurnRole` |
| `trace/limits.ts` | `limits.ts` | `FittedPayload fitPayload fitText` |
| `trace/scrub.ts` | `scrub.ts` | `scrubTraceJson scrubTraceText` |
| `trace/url-shape.ts` | `url-shape.ts` | `ShapedUrl shapeUrl` |
| `trace/transcript.ts` | `transcript.ts` | `ParsedTranscript ParsedTurn parseTranscript` |
| `trace/join.ts` | `join.ts` | `CallSpanRef JoinResult JoinedTurn joinTurns` |

Tests: `trace-join`, `trace-limits`, `trace-scrub`, `trace-transcript`, `trace-url-shape`, the
trace cases of `schemas.test.ts`.

## C. `@pathfinder/docs-model` (`apps/crawler/packages/docs-model/`)

| From `core/src/schemas/` | Exported names |
| --- | --- |
| `doc-record.ts` | `DocKind DocRecord KEY_PREFIX` |
| `doc-revision.ts` | `DocRevision RevisionChange RevisionStatus` |
| `doc-content.ts` | `DocContent DOC_CONTENT_BY_KIND` and the 24 `*Content`/part types |
| `doc-relation.ts` | `DocRelation RelationType` |
| `doc-review.ts` | `DocReview ReviewAction` |
| `evidence-link.ts` | `DocEvidenceLink EvidenceTargetKind` |
| `analysis-session.ts` | `AnalysisPass AnalysisSession AnalysisSessionPassEntry AnalysisSessionRun AnalysisSessionStatus` |
| `followup-task.ts` | `FollowupStatus FollowupTask` |
| `process.ts` | `Process ProcessOutcome ProcessStatus` |
| `process-step.ts` | `ProcessStep ProcessStepKind` |

## D. `@pathfinder/chat-model` (`apps/crawler/packages/chat-model/`)

| From `core/src/schemas/` | Exported names |
| --- | --- |
| `chat-conversation.ts` | `ChatConversation ChatConversationStatus ChatMessage ChatMessageRole` |
| `workflow-step.ts` | `WorkflowStep WorkflowStepName WorkflowStepStatus` |
| `process-scope.ts` | `ProcessScope ProcessScopeSource` |
| `amendment.ts` | `Amendment AmendmentAnchorElement AmendmentKind AmendmentStatus AmendmentSupersededReason AmendmentTargetKind` |

## Importers (2026-10-07: 136 files import `@pathfinder/core`)

By moved module, files / packages: `db` 39 (chat, crawler app scripts, crawler, docs, gates,
mcp-server, vault), `migrate` 18, `evidence` 18 (stays), `ids` 39 (stays), `tracer` 14 (gates,
mcp-server), `log` 7 (gates, mcp-server; `createLogger` stays), `audit` 4, `db-types` 4, `portal-data`
3, `Selectable` 3, `url-shape` 4, `import-agent` 1, doc schemas 16+9+9+6+6+3+3+1 (docs,
mcp-server), chat schemas 4+7+2+1 (apps/chat).
