-- 0048_trace_server_mudpuppy (down): back to the pre-rename list: trace_boots.server may only be 'pathfinder'
-- and the rows are rewritten to it. Same rebuild as the up file (foreign_keys OFF during a migration).

CREATE TABLE trace_boots_new (
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

INSERT INTO trace_boots_new (id, started_at, ended_at, environment, server, pid, version, trace_level, pw_trace)
SELECT id, started_at, ended_at, environment, 'pathfinder', pid, version, trace_level, pw_trace FROM trace_boots;

DROP TABLE trace_boots;
ALTER TABLE trace_boots_new RENAME TO trace_boots;
