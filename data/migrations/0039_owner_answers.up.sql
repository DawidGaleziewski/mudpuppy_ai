-- 0039_owner_answers (up, spec 039, the owner's answers of 2026-10-21):
-- (8)  A process's A and B are process models, also in their columns: `variant_id` → `model_id`
--      (variant now means a screen variant only).
-- (10) A journey that opens the start screen by URL (a deep link) is a process instance:
--      `process_instances.trigger_kind` says how it entered; a deep link names the observation.
-- (14) A person accepts the similarity classifier before the reconciler uses it.

ALTER TABLE process_models RENAME COLUMN branched_from_variant_id TO branched_from_model_id;
ALTER TABLE process_model_revisions RENAME COLUMN variant_id TO model_id;
ALTER TABLE process_drafts RENAME COLUMN variant_id TO model_id;
ALTER TABLE process_live RENAME COLUMN variant_id TO model_id;
ALTER TABLE process_live RENAME COLUMN variant_rev TO model_rev;
ALTER TABLE change_spec_revisions RENAME COLUMN left_variant_id TO left_model_id;
ALTER TABLE change_spec_revisions RENAME COLUMN right_variant_id TO right_model_id;

CREATE TABLE process_instances_new (
  id                     TEXT PRIMARY KEY,
  process_id             TEXT NOT NULL REFERENCES ba_processes(id),
  journey_id             TEXT NOT NULL REFERENCES journeys(id),
  trigger_kind           TEXT NOT NULL CHECK (trigger_kind IN ('transition','deep_link')),
  trigger_transition_id  TEXT REFERENCES transitions(id),
  trigger_observation_id TEXT REFERENCES observations(id),
  last_transition_id     TEXT REFERENCES transitions(id),   -- NULL: the deep link was the whole walk
  outcome                TEXT NOT NULL CHECK (outcome IN
                           ('completed','exited','error','abandoned','incomplete')),
  outcome_screen_id      TEXT REFERENCES model_screens(id),
  correlation_id         TEXT REFERENCES correlation_ids(id),
  model_version_id       TEXT NOT NULL REFERENCES model_versions(id),
  CHECK ((trigger_kind = 'transition') = (trigger_transition_id IS NOT NULL)),
  CHECK ((trigger_kind = 'deep_link') = (trigger_observation_id IS NOT NULL)),
  CHECK (trigger_kind = 'deep_link' OR last_transition_id IS NOT NULL)
) STRICT;
INSERT INTO process_instances_new (id, process_id, journey_id, trigger_kind, trigger_transition_id,
  trigger_observation_id, last_transition_id, outcome, outcome_screen_id, correlation_id,
  model_version_id)
SELECT id, process_id, journey_id, 'transition', trigger_transition_id, NULL, last_transition_id,
  outcome, outcome_screen_id, correlation_id, model_version_id FROM process_instances;
DROP INDEX ux_process_instances_trigger;
DROP INDEX ix_process_instances_process;
DROP TABLE process_instances;
ALTER TABLE process_instances_new RENAME TO process_instances;
CREATE INDEX ix_process_instances_process ON process_instances (process_id, model_version_id);
CREATE UNIQUE INDEX ux_process_instances_trigger ON process_instances
  (process_id, coalesce(trigger_transition_id, trigger_observation_id), model_version_id);

ALTER TABLE similarity_classifiers ADD COLUMN accepted_by TEXT
  CHECK (accepted_by IS NULL OR length(accepted_by) > 0);
ALTER TABLE similarity_classifiers ADD COLUMN accepted_at TEXT;
