# @pathfinder/trace

The run-trace model: Zod schemas of trace boots, spans and imported agent turns, and the pure helpers
that shape what goes into a trace (scrubbing, payload limits, URL shaping, transcript parsing and
joining).

Layer: models (G-07; `apps/crawler/layers.json`)

## Public API

- Schemas: `TraceBoot`, `TraceSpan`, `AgentTurn` and their enums (`TraceLevel`, `PwTraceMode`,
  `TraceServer`, `SpanKind`, `SpanStatus`, `AgentTurnRole`, `AgentTurnKind`).
- `scrubTraceJson`, `scrubTraceText` (`scrub.ts`), `fitPayload`, `fitText` (`limits.ts`, 8 KB attrs,
  bigger payloads to evidence), `shapeUrl` (`url-shape.ts`), `parseTranscript` (`transcript.ts`),
  `joinTurns` (`join.ts`).
- Used by: store (the tracer and `importAgent` write the DB with these), mcp-server.

## Invariants

- Pure: no DB, no browser, no LLM. The DB writer (`createTracer`) lives in `@pathfinder/store`.
- Enums equal the CHECK lists of `data/migrations/0003_trace.up.sql` (`tests/schemas.test.ts`).
- Nothing unscrubbed or untruncated reaches a span: secrets and PII are masked here first.

## Where to add things

- New span attribute shape or enum value: the schema here, the migration via `db-admin`, and the
  table type in `store/src/db-types.ts`.

## Tests

- `pnpm exec vitest run --project trace` (from `apps/crawler`); tier: fast. Transcript fixture in
  `tests/fixtures/crawler-transcript.jsonl` (also read by store's import test).

## See also

- specs/005-crawl-run-observability-trace, specs/012-maintainability (move-map.md),
  docs/code-guidelines.md (G-07, G-09)
