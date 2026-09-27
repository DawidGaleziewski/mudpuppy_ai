-- 0003_trace (up): crawl run observability trace (R-17 spec 005). Three new STRICT tables; no
-- existing table changes, so no table-rebuild dance and no FK toggling needed here.
-- Conventions: see data/schema/README.md. Ids: server-generated UUIDv7 text. Timestamps: UTC ISO
-- 8601 text, millisecond precision, 'Z' suffix. attrs_json/detail-shaped JSON: TEXT + json_valid.

-- One row per MCP server process; orders trace_spans across processes and records how tracing was
-- configured for that process (FR-016, FR-022 area of the trace spec).
CREATE TABLE trace_boots (
  id          TEXT PRIMARY KEY,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,            -- set on clean shutdown; NULL = crashed or still running
  environment TEXT NOT NULL,   -- data/db/<env> this process writes
  server      TEXT NOT NULL CHECK (server IN ('pathfinder')),  -- room for the BA server later
  pid         INTEGER NOT NULL,
  version     TEXT NOT NULL,   -- @pathfinder/mcp-server package version + git short SHA if available
  trace_level TEXT NOT NULL CHECK (trace_level IN ('off','standard','verbose')),
  pw_trace    TEXT NOT NULL CHECK (pw_trace IN ('non_production','all'))  -- 'all' = PATHFINDER_PW_TRACE=1
) STRICT;

-- One row per call/phase/event of a boot. Ordered by (boot_id, seq); a run's spans span boots in
-- rare crash/resume cases, so callers order by boot.started_at then seq.
CREATE TABLE trace_spans (
  id             TEXT PRIMARY KEY,
  boot_id        TEXT NOT NULL REFERENCES trace_boots(id),
  seq            INTEGER NOT NULL,  -- in-process counter; unique per boot
  run_id         TEXT REFERENCES runs(id),          -- NULL for calls outside any run (FR-016)
  parent_id      TEXT REFERENCES trace_spans(id),   -- NULL for call spans and between-calls events
  kind           TEXT NOT NULL CHECK (kind IN ('call','phase','event')),
  name           TEXT NOT NULL,  -- vocabulary in specs/005-crawl-run-observability-trace/contracts/trace-spans.md
  status         TEXT NOT NULL CHECK (status IN ('running','ok','refused','stopped','error','unfinished')),
  started_at     TEXT NOT NULL,
  ended_at       TEXT,           -- NULL while running/unfinished and for events
  duration_ms    INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  attrs_json     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attrs_json) AND json_type(attrs_json) = 'object'),  -- scrubbed, <= 8 KB
  payload_ref    TEXT,           -- evidence file (<sha256>.json) with the full scrubbed payload
  summary        TEXT NOT NULL,  -- masked one-liner for list views
  decision_id    TEXT REFERENCES decision_log(id),  -- only on 'event decision'
  tool_use_id    TEXT,           -- 'call' only; from _meta["claudecode/toolUseId"]
  agent_id       TEXT,           -- 'call' only; from _meta["claudecode/agentId"] when sent
  rationale      TEXT CHECK (rationale IS NULL OR length(rationale) <= 300),  -- 'call' only; masked; agent-stated
  pw_trace_path  TEXT,           -- 'call' only; relative to data/
  between_calls  INTEGER NOT NULL DEFAULT 0 CHECK (between_calls IN (0,1)),  -- 1 = event of a run with no active call
  -- completed call/phase spans must record how long they took; running/unfinished and events need not
  CHECK (
    duration_ms IS NOT NULL
    OR kind = 'event'
    OR status IN ('running','unfinished')
  )
) STRICT;
CREATE UNIQUE INDEX ux_trace_spans_boot_seq ON trace_spans(boot_id, seq);
-- Call list and child expansion, ordered by (boot, seq) within a run.
CREATE INDEX ix_trace_spans_run ON trace_spans(run_id, parent_id, boot_id, seq);
-- Transcript join (agent_turns.tool_use_id).
CREATE INDEX ix_trace_spans_tool_use ON trace_spans(tool_use_id);
CREATE INDEX ix_trace_spans_decision ON trace_spans(decision_id);

-- Imported crawler agent transcript, one row per content block, joined to trace_spans by
-- tool_use_id (research §12; specs/005-crawl-run-observability-trace/contracts/agent-import.md).
CREATE TABLE agent_turns (
  id                    TEXT PRIMARY KEY,
  agent_id              TEXT NOT NULL,
  agent_type            TEXT NOT NULL,  -- 'crawler'
  session_id            TEXT,           -- parent Claude Code session
  message_uuid          TEXT NOT NULL,  -- transcript entry 'uuid' (one entry per content block)
  block_index           INTEGER NOT NULL,  -- entry apiBlockIndex (else position in content)
  api_message_id        TEXT,           -- assistant message.id; groups the blocks of one API response
  run_id                TEXT REFERENCES runs(id),  -- assignment rule in research §12; NULL if no match
  role                  TEXT NOT NULL CHECK (role IN ('assistant','user')),
  kind                  TEXT NOT NULL CHECK (kind IN ('text','thinking','tool_use','tool_result')),
  tool_use_id           TEXT,           -- tool_use/tool_result
  tool_name             TEXT,           -- tool_use
  text                  TEXT,           -- masked, <= 4 KB (text blocks; tool_use input as scrubbed JSON)
  payload_ref           TEXT,           -- evidence file when over the cap
  is_error              INTEGER CHECK (is_error IS NULL OR is_error IN (0,1)),  -- tool_result
  model                 TEXT,           -- assistant messages
  input_tokens          INTEGER,        -- once per api_message_id, on its highest block_index row
  output_tokens         INTEGER,        -- max over the message's entries (research §12)
  cache_read_tokens     INTEGER,
  cache_creation_tokens INTEGER,
  matched               INTEGER NOT NULL DEFAULT 0 CHECK (matched IN (0,1)),  -- tool_use of mcp__pathfinder__* with a matching span
  created_at            TEXT NOT NULL,  -- transcript 'timestamp'
  imported_at           TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX ux_agent_turns_agent_message_block ON agent_turns(agent_id, message_uuid, block_index);
CREATE INDEX ix_agent_turns_run ON agent_turns(run_id, created_at);
CREATE INDEX ix_agent_turns_tool_use ON agent_turns(tool_use_id);
