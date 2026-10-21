-- 0036_processes (up, spec 039 design § 13.4, T070): one process concept. Correlation ids and
-- process instances (journeys through a process, with their outcome), the triggers and start
-- screen of a process, its explorations, exactly one PROC record per process, and v1's variants
-- renamed to process models. Screens are `model_screens` (the design's `screens`).

CREATE TABLE correlation_ids (
  id                  TEXT PRIMARY KEY,
  journey_id          TEXT NOT NULL REFERENCES journeys(id),
  key_path            TEXT NOT NULL CHECK (length(key_path) > 0),   -- 'response:$.quote.id'
  value_hash          TEXT NOT NULL CHECK (length(value_hash) = 64),
  endpoint_family     TEXT NOT NULL CHECK (length(endpoint_family) > 0),
  first_transition_id TEXT NOT NULL REFERENCES transitions(id),
  last_transition_id  TEXT NOT NULL REFERENCES transitions(id)
) STRICT;
CREATE INDEX ix_correlation_ids_journey ON correlation_ids (journey_id);

CREATE TABLE process_instances (
  id                    TEXT PRIMARY KEY,
  process_id            TEXT NOT NULL REFERENCES ba_processes(id),
  journey_id            TEXT NOT NULL REFERENCES journeys(id),
  trigger_transition_id TEXT NOT NULL REFERENCES transitions(id),
  last_transition_id    TEXT NOT NULL REFERENCES transitions(id),
  outcome               TEXT NOT NULL CHECK (outcome IN
                          ('completed','exited','error','abandoned','incomplete')),
  outcome_screen_id     TEXT REFERENCES model_screens(id),
  correlation_id        TEXT REFERENCES correlation_ids(id),
  model_version_id      TEXT NOT NULL REFERENCES model_versions(id)
) STRICT;
CREATE INDEX ix_process_instances_process ON process_instances (process_id, model_version_id);
CREATE UNIQUE INDEX ux_process_instances_trigger ON process_instances
  (process_id, trigger_transition_id, model_version_id);

ALTER TABLE ba_processes ADD COLUMN start_screen_id TEXT REFERENCES model_screens(id);
ALTER TABLE ba_processes ADD COLUMN boundary_hypothesis_id TEXT REFERENCES hypotheses(id);

CREATE TABLE process_triggers (
  process_id          TEXT NOT NULL REFERENCES ba_processes(id),
  model_transition_id TEXT NOT NULL REFERENCES model_transitions(id),
  PRIMARY KEY (process_id, model_transition_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE process_explorations (
  id             TEXT PRIMARY KEY,
  process_id     TEXT NOT NULL REFERENCES ba_processes(id),
  epoch_set      TEXT NOT NULL CHECK (json_valid(epoch_set) AND json_type(epoch_set) = 'array'),
  depth          INTEGER NOT NULL CHECK (depth >= 0),
  random_walks   INTEGER NOT NULL CHECK (random_walks >= 0),
  new_deviations INTEGER NOT NULL CHECK (new_deviations >= 0),
  completed_at   TEXT NOT NULL
) STRICT;
CREATE INDEX ix_process_explorations_process ON process_explorations (process_id, completed_at);

-- One concept: exactly one PROC record per process. Records opened before (record_key) are linked;
-- a PROC record without a process is refused on insert and when its kind or process changes.
ALTER TABLE doc_records ADD COLUMN process_id TEXT REFERENCES ba_processes(id);
UPDATE doc_records SET process_id = (
  SELECT p.id FROM ba_processes p
  WHERE p.portal_id = doc_records.portal_id AND p.record_key = doc_records.key
  ORDER BY p.key LIMIT 1
) WHERE kind = 'process';
CREATE UNIQUE INDEX ux_doc_records_one_proc ON doc_records (process_id) WHERE kind = 'process';
CREATE TRIGGER doc_records_proc_needs_process BEFORE INSERT ON doc_records
  WHEN NEW.kind = 'process' AND NEW.process_id IS NULL
  BEGIN SELECT RAISE(ABORT, 'PROC record needs process_id'); END;
CREATE TRIGGER doc_records_proc_keeps_process BEFORE UPDATE OF kind, process_id ON doc_records
  WHEN NEW.kind = 'process' AND NEW.process_id IS NULL
  BEGIN SELECT RAISE(ABORT, 'PROC record needs process_id'); END;

ALTER TABLE process_variants RENAME TO process_models;
ALTER TABLE process_variant_revisions RENAME TO process_model_revisions;
