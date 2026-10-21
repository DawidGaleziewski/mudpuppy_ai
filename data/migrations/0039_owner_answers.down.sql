-- 0039_owner_answers (down): classifiers need no person, deep-link instances go (their table has
-- no place for them), process models' columns are variant columns again.

ALTER TABLE similarity_classifiers DROP COLUMN accepted_at;
ALTER TABLE similarity_classifiers DROP COLUMN accepted_by;

CREATE TABLE process_instances_old (
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
INSERT INTO process_instances_old (id, process_id, journey_id, trigger_transition_id,
  last_transition_id, outcome, outcome_screen_id, correlation_id, model_version_id)
SELECT id, process_id, journey_id, trigger_transition_id, last_transition_id, outcome,
  outcome_screen_id, correlation_id, model_version_id FROM process_instances
 WHERE trigger_kind = 'transition';
DROP INDEX ux_process_instances_trigger;
DROP INDEX ix_process_instances_process;
DROP TABLE process_instances;
ALTER TABLE process_instances_old RENAME TO process_instances;
CREATE INDEX ix_process_instances_process ON process_instances (process_id, model_version_id);
CREATE UNIQUE INDEX ux_process_instances_trigger ON process_instances
  (process_id, trigger_transition_id, model_version_id);

ALTER TABLE change_spec_revisions RENAME COLUMN right_model_id TO right_variant_id;
ALTER TABLE change_spec_revisions RENAME COLUMN left_model_id TO left_variant_id;
ALTER TABLE process_live RENAME COLUMN model_rev TO variant_rev;
ALTER TABLE process_live RENAME COLUMN model_id TO variant_id;
ALTER TABLE process_drafts RENAME COLUMN model_id TO variant_id;
ALTER TABLE process_model_revisions RENAME COLUMN model_id TO variant_id;
ALTER TABLE process_models RENAME COLUMN branched_from_model_id TO branched_from_variant_id;
