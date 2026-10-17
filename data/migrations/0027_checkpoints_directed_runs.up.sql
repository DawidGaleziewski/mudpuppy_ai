-- 0027_checkpoints_directed_runs (up): spec 034 (FR-001, FR-003, FR-012; decisions A-1, A-3, A-9).
-- 1. checkpoints: the recorded way back to a state, one per (run, state), the shortest the run took (the app
--    overwrites it when it finds a shorter one). start_url is the URL of the last navigate before the steps;
--    steps_json is an array of {action_id, value, fills?, to_state}, validated by Zod (CheckpointRow);
--    an empty array means the state opens directly by URL.
-- 2. runs: run_type (NULL = a plain run as before), parent_run_id (the run a directed run continues or
--    retries) and plan_json (the plan it came from).
-- 3. network_calls: a masked sample body of at most 4096 characters, recorded only outside production
--    (the app decides; NULL otherwise).
-- Indexes: checkpoints by state_id (the replay looks up "a checkpoint for this state, any run of this
-- portal"); runs by parent_run_id (the recovery screen lists the attempts and continuations of a run).

CREATE TABLE checkpoints (
  id         TEXT PRIMARY KEY,                                               -- UUIDv7
  run_id     TEXT NOT NULL REFERENCES runs(id),
  state_id   TEXT NOT NULL REFERENCES states(id),
  start_url  TEXT NOT NULL CHECK (length(start_url) > 0),
  steps_json TEXT NOT NULL CHECK (json_valid(steps_json) AND json_type(steps_json) = 'array'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (run_id, state_id)
) STRICT;

CREATE INDEX ix_checkpoints_state ON checkpoints (state_id);

ALTER TABLE runs ADD COLUMN run_type TEXT
  CHECK (run_type IS NULL OR run_type IN ('full','continue','focused','recheck','retry','probe','trace'));
ALTER TABLE runs ADD COLUMN parent_run_id TEXT REFERENCES runs(id);
ALTER TABLE runs ADD COLUMN plan_json TEXT CHECK (plan_json IS NULL OR json_valid(plan_json));

CREATE INDEX ix_runs_parent ON runs (parent_run_id);

ALTER TABLE network_calls ADD COLUMN req_sample TEXT CHECK (req_sample IS NULL OR length(req_sample) <= 4096);
ALTER TABLE network_calls ADD COLUMN res_sample TEXT CHECK (res_sample IS NULL OR length(res_sample) <= 4096);
