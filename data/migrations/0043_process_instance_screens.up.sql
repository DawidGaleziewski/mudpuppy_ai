-- 0043_process_instance_screens (up, spec 039 T079): a process instance keeps the model screen ids it
-- walked, start screen first: its trace variant. NULL on rows written before 0043.

ALTER TABLE process_instances ADD COLUMN screens_json TEXT
  CHECK (screens_json IS NULL OR (json_valid(screens_json) AND json_type(screens_json) = 'array'));
