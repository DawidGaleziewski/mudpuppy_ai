# Data Model: Crawl Run Observability Trace

Migration `0003_trace` (`data/migrations/0003_trace.{up,down}.sql`, owner `db-admin`, skill
`sqlite-conventions`). Three STRICT tables; no existing table changes. Conventions as in
`data/schema/README.md` (UUIDv7 ids, ISO-8601 ms `Z` timestamps, JSON text with `json_valid`,
booleans 0/1 with CHECK, integer ms durations).

## `trace_boots`

One row per MCP server process. Orders spans across processes and records how tracing was
configured.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUIDv7 |
| `started_at` | TEXT NOT NULL | |
| `ended_at` | TEXT | set on clean shutdown; NULL = crashed or running |
| `environment` | TEXT NOT NULL | `data/db/<env>` this process writes |
| `server` | TEXT NOT NULL CHECK IN (`pathfinder`) | room for the BA server later |
| `pid` | INTEGER NOT NULL | |
| `version` | TEXT NOT NULL | `@pathfinder/mcp-server` package version + git short SHA if available |
| `trace_level` | TEXT NOT NULL CHECK IN (`off`,`standard`,`verbose`) | |
| `pw_trace` | TEXT NOT NULL CHECK IN (`non_production`,`all`) | `all` = `PATHFINDER_PW_TRACE=1` |

## `trace_spans`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUIDv7 |
| `boot_id` | TEXT NOT NULL → `trace_boots(id)` | |
| `seq` | INTEGER NOT NULL | in-process counter; UNIQUE(`boot_id`,`seq`) |
| `run_id` | TEXT → `runs(id)` | NULL for calls outside any run (FR-016) |
| `parent_id` | TEXT → `trace_spans(id)` | NULL for `call` spans and between-calls events |
| `kind` | TEXT NOT NULL CHECK IN (`call`,`phase`,`event`) | |
| `name` | TEXT NOT NULL | vocabulary in `contracts/trace-spans.md` |
| `status` | TEXT NOT NULL CHECK IN (`running`,`ok`,`refused`,`stopped`,`error`,`unfinished`) | events are written final (`ok` unless they record a refusal/error) |
| `started_at` | TEXT NOT NULL | |
| `ended_at` | TEXT | NULL while running/unfinished and for events |
| `duration_ms` | INTEGER CHECK (≥ 0) | NULL for events; required when `kind IN ('call','phase') AND status NOT IN ('running','unfinished')` |
| `attrs_json` | TEXT NOT NULL DEFAULT `'{}'` CHECK json_valid, json_type object | scrubbed, ≤ 8 KB |
| `payload_ref` | TEXT | evidence file (`<sha256>.json`) with the full scrubbed payload |
| `summary` | TEXT NOT NULL | masked one-liner for list views |
| `decision_id` | TEXT → `decision_log(id)` | only on `event decision` |
| `tool_use_id` | TEXT | `call` only; from `_meta["claudecode/toolUseId"]` |
| `agent_id` | TEXT | `call` only; from `_meta["claudecode/agentId"]` when sent |
| `rationale` | TEXT CHECK (length ≤ 300) | `call` only; masked; agent-stated |
| `pw_trace_path` | TEXT | `call` only; relative to `data/` |
| `between_calls` | INTEGER NOT NULL DEFAULT 0 CHECK IN (0,1) | 1 = event of a run with no active call |

Indexes: `ux_trace_spans_boot_seq(boot_id, seq)`, `ix_trace_spans_run(run_id, parent_id, boot_id,
seq)` (call list and child expansion), `ix_trace_spans_tool_use(tool_use_id)` (transcript join),
`ix_trace_spans_decision(decision_id)`.

State transitions: `call`/`phase` `running` → `ok | refused | stopped | error`; `running` of an
earlier boot → `unfinished` (swept on server start). No other transition.

## `agent_turns`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUIDv7 |
| `agent_id` | TEXT NOT NULL | |
| `agent_type` | TEXT NOT NULL | `crawler` |
| `session_id` | TEXT | parent Claude Code session |
| `message_uuid` | TEXT NOT NULL | transcript entry `uuid` (one entry per content block) |
| `block_index` | INTEGER NOT NULL | entry `apiBlockIndex` (else position in `content`); UNIQUE(`agent_id`,`message_uuid`,`block_index`) |
| `api_message_id` | TEXT | assistant `message.id`; groups the blocks of one API response |
| `run_id` | TEXT → `runs(id)` | assignment rule in research §12; NULL if no match |
| `role` | TEXT NOT NULL CHECK IN (`assistant`,`user`) | |
| `kind` | TEXT NOT NULL CHECK IN (`text`,`thinking`,`tool_use`,`tool_result`) | `thinking` stored as presence only (content is empty in transcripts) |
| `tool_use_id` | TEXT | `tool_use`/`tool_result` |
| `tool_name` | TEXT | `tool_use` |
| `text` | TEXT | masked, ≤ 4 KB (text blocks; tool_use input as scrubbed JSON) |
| `payload_ref` | TEXT | evidence file when over the cap |
| `is_error` | INTEGER CHECK IN (0,1) | `tool_result` |
| `model` | TEXT | assistant messages |
| `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens` | INTEGER | once per `api_message_id`, on its highest `block_index` row; `output_tokens` = max over the message's entries (research §12) |
| `matched` | INTEGER NOT NULL DEFAULT 0 CHECK IN (0,1) | `tool_use` of `mcp__pathfinder__*` with a matching span |
| `created_at` | TEXT NOT NULL | transcript `timestamp` |
| `imported_at` | TEXT NOT NULL | |

Indexes: `ix_agent_turns_run(run_id, created_at)`, `ix_agent_turns_tool_use(tool_use_id)`.

## Zod schemas (`apps/crawler/packages/core/src/schemas/`)

`trace-boot.ts`, `trace-span.ts` (`SpanKind`, `SpanStatus`, `TraceSpan` with the refinements above),
`agent-turn.ts`; exported from `schemas/index.ts`; `db-types.ts` gains the three tables. Schema tests
assert Zod enums equal the migration CHECK lists (existing approach).

## Portal data partition (`core/src/portal-data.ts`)

`trace_spans` and `agent_turns` join `PORTAL_TABLES` via `run_id`; in `DELETE_ORDER` they come before
`decision_log` (spans reference it) and `runs`. `trace_spans` self-references `parent_id`: delete
events, then phases, then calls (or `parent_id` → NULL first, in the same transaction). Run-less
spans and `trace_boots` belong to no portal and are never exported or deleted by portal scripts.
`portal:delete` also removes `data/traces/<portal>/`; `portal:export` excludes it.

## Dashboard read models (`apps/dashboard/src/pathfinder_dashboard/models.py`)

`TraceBoot`, `TraceSpan`, `AgentTurn` — one field per column, literals for CHECK enums, JSON parsed
with raw-string fallback; covered by `tests/test_models_schema.py`.

View models (derived): `TraceCallRow` (call span + child counts + problem flags + agent tokens +
preceding agent text), `SpanNode` (a span and its direct children, loaded lazily), `TraceSummary`
(time per phase name, counts by kind/status, slowest calls, token totals, health: dropped,
truncated, unmatched agent calls, unfinished calls), `ActivityRow` (run-less call).

## Validation rules from the spec

- Completed `call`/`phase` spans have `duration_ms`; phase durations of a completed browser call sum
  to within 5% of the call (SC-003; asserted in `trace-map-run.test.ts`).
- Every `decision_log` row of a traced run has exactly one `event decision` span (SC-002).
- No stored text contains a scrubber-corpus value (SC-006).
