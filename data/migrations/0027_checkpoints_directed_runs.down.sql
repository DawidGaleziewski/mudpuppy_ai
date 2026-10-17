-- 0027_checkpoints_directed_runs (down): forget checkpoints, run types, plans and body samples.
-- network_calls loses its two sample columns. SQLite cannot drop a column that carries a FOREIGN KEY, so runs
-- is rebuilt without run_type, parent_run_id and plan_json (the runner has foreign_keys OFF during a
-- migration, as 0015 and 0026 relied on), keeping every other column, CHECK and row.

DROP TABLE checkpoints;
DROP INDEX ix_runs_parent;

ALTER TABLE network_calls DROP COLUMN res_sample;
ALTER TABLE network_calls DROP COLUMN req_sample;

CREATE TABLE runs_old (
  id                  TEXT PRIMARY KEY,
  portal_id           TEXT NOT NULL,
  persona_id          TEXT NOT NULL,
  mode                TEXT NOT NULL,  -- 'map' today; deliberately no CHECK so 'trace' needs no migration (FR-022); Zod enforces
  environment         TEXT NOT NULL,
  env_version_or_date TEXT NOT NULL,
  seed_id             TEXT,
  viewport            TEXT NOT NULL,
  locale              TEXT NOT NULL,
  browser             TEXT NOT NULL,
  config_snapshot     TEXT NOT NULL CHECK (json_valid(config_snapshot)),
  status              TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running','completed','stopped_warning','interrupted')),
  warning             TEXT,           -- run-level warning (block/CAPTCHA, FR-008); required when stopped_warning
  steps_used          INTEGER NOT NULL DEFAULT 0 CHECK (steps_used >= 0),
  elapsed_ms          INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),  -- accumulated active time, excludes downtime between resumes
  max_depth_reached   INTEGER NOT NULL DEFAULT 0 CHECK (max_depth_reached >= 0),
  started_at          TEXT NOT NULL,
  ended_at            TEXT,
  coverage            TEXT CHECK (coverage IS NULL OR json_valid(coverage)),
  -- 0009 (ALTER TABLE): the pathfinder server process driving the run; NULL before 0009 (F-14).
  owner_id            TEXT CHECK (owner_id IS NULL OR length(owner_id) > 0),
  owner_pid           INTEGER CHECK (owner_pid IS NULL OR owner_pid > 0),
  CHECK (status <> 'stopped_warning' OR warning IS NOT NULL)
) STRICT;

INSERT INTO runs_old (id, portal_id, persona_id, mode, environment, env_version_or_date, seed_id, viewport,
                      locale, browser, config_snapshot, status, warning, steps_used, elapsed_ms,
                      max_depth_reached, started_at, ended_at, coverage, owner_id, owner_pid)
SELECT id, portal_id, persona_id, mode, environment, env_version_or_date, seed_id, viewport,
       locale, browser, config_snapshot, status, warning, steps_used, elapsed_ms,
       max_depth_reached, started_at, ended_at, coverage, owner_id, owner_pid FROM runs;

DROP TABLE runs;
ALTER TABLE runs_old RENAME TO runs;
