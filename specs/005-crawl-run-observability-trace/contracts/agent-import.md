# Contract: agent transcript import

Rationale in `../research.md` §0 and §12; table `agent_turns` in `../data-model.md`.

## CLI

```text
pnpm trace:import-agent --hook                    # SubagentStop JSON on stdin
pnpm trace:import-agent --transcript <path.jsonl>
pnpm trace:import-agent --agent-id <id>           # globs ~/.claude/projects/*/*/subagents/agent-<id>.jsonl
  [--data-dir <dir>]                              # default <repo>/data
```

Output (stdout, one JSON object): `{agent_id, stores: [{env, run_ids, turns, matched, unmatched_agent_calls, unmatched_server_calls}], skipped?: reason}`.
Exit code 0 always in `--hook` mode (never blocks the session); otherwise 1 on unreadable input.

## Hook (`.claude/settings.json`)

```json
{ "hooks": { "SubagentStop": [ { "matcher": "crawler", "hooks": [
  { "type": "command", "command": "pnpm --silent --dir apps/crawler trace:import-agent --hook" } ] } ] } }
```

Merged into the existing file; the existing PostToolUse/PreToolUse hooks stay.

## Parsing (`core/src/trace/transcript.ts`, pure)

`parseTranscript(lines: string[], meta?: {agentType}) → AgentTurn[]`:

- Entries with `type: "assistant"`: one row per `message.content` block; `model` and `usage`
  (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) on
  block 0 only. `thinking` → row with `text = NULL`. `tool_use` → `tool_use_id`, `tool_name`,
  scrubbed `input` as `text`.
- Entries with `type: "user"` whose content is an array: one row per `tool_result` block
  (`tool_use_id`, `is_error`, scrubbed content as `text`); string content (the prompt) → one `text`
  row.
- `isMeta`, `attachment` and unknown entry types are skipped; unknown block types are counted and
  reported, not failed.
- `message_uuid` = entry `uuid`; `created_at` = entry `timestamp`.

## Join (`core/src/trace/join.ts`, pure)

`joinTurns(turns, spans) → {turns with run_id + matched, unmatchedAgentCalls, unmatchedServerCalls}`:

- `tool_use.tool_use_id == trace_spans.tool_use_id` (kind `call`) → matched; run id from the span.
- Other turns take the run of the nearest following matched `tool_use` in transcript order, else
  the nearest preceding.
- `unmatchedAgentCalls`: `tool_use` named `mcp__pathfinder__*` with no span ("never reached server").
- `unmatchedServerCalls`: call spans in the matched runs whose `agent_id` equals this transcript's
  agent and whose `tool_use_id` has no `tool_use` row.

## Idempotency

Upsert on `(agent_id, message_uuid, block_index)`; re-import of the same file yields an identical
table (tested). A longer transcript (resumed agent) adds rows and may re-assign `run_id` of trailing
turns.
