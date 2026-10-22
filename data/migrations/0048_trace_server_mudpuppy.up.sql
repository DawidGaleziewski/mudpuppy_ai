-- 0048_trace_server_mudpuppy (up): spec 041 (R-83, the product rename pathfinder -> MudPuppy). The MCP server
-- is now named 'mudpuppy', so trace_boots.server may only be 'mudpuppy' and the existing rows are rewritten.
-- The CHECK list changes, so trace_boots is rebuilt with every row kept (the runner has foreign_keys OFF during
-- a migration, as 0028 relies on); trace_spans.boot_id keeps referencing trace_boots by name. No index changes.
-- The column comments name the renamed package (@mudpuppy/mcp-server) and env var (MUDPUPPY_PW_TRACE).

CREATE TABLE trace_boots_new (
  id          TEXT PRIMARY KEY,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,            -- set on clean shutdown; NULL = crashed or still running
  environment TEXT NOT NULL,   -- data/db/<env> this process writes
  server      TEXT NOT NULL CHECK (server IN ('mudpuppy')),  -- room for the BA server later
  pid         INTEGER NOT NULL,
  version     TEXT NOT NULL,   -- @mudpuppy/mcp-server package version + git short SHA if available
  trace_level TEXT NOT NULL CHECK (trace_level IN ('off','standard','verbose')),
  pw_trace    TEXT NOT NULL CHECK (pw_trace IN ('non_production','all'))  -- 'all' = MUDPUPPY_PW_TRACE=1
) STRICT;

INSERT INTO trace_boots_new (id, started_at, ended_at, environment, server, pid, version, trace_level, pw_trace)
SELECT id, started_at, ended_at, environment, 'mudpuppy', pid, version, trace_level, pw_trace FROM trace_boots;

DROP TABLE trace_boots;
ALTER TABLE trace_boots_new RENAME TO trace_boots;
