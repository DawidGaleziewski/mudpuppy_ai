-- 0051_process_scope_merge (down): drops process_scope_screens and process_merges (their indexes go with
-- them) and rebuilds the two revision tables with 0028's CHECK lists. Revision rows with the new change values
-- (process_model_revisions 'scope'/'merge'/'unmerge', ba_process_revisions 'merge'/'unmerge') have no place in
-- the old lists and are DELETED; every other row is kept. Heads (process_models.rev, ba_processes.rev) that
-- pointed at a deleted row are not repaired: down is for scratch DBs and local test data.

DROP TABLE process_merges;
DROP TABLE process_scope_screens;

CREATE TABLE process_model_revisions_old (
  model_id      TEXT NOT NULL REFERENCES process_models(id),
  rev           INTEGER NOT NULL CHECK (rev >= 1),
  base_rev      INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),   -- NULL for r1
  change        TEXT NOT NULL CHECK (change IN ('create','branch','save','restore','observe','edit')),
  author        TEXT NOT NULL CHECK (length(author) > 0),            -- reviewer name, or 'scan:<run id>' for observe
  steps         TEXT NOT NULL CHECK (json_valid(steps) AND json_type(steps) = 'array'),  -- ordered ProcessStep objects
  note          TEXT,                                                -- the one line the history shows
  run_id        TEXT REFERENCES runs(id),                            -- for observe
  restored_from INTEGER CHECK (restored_from IS NULL OR restored_from >= 1),  -- for restore
  created_at    TEXT NOT NULL,
  PRIMARY KEY (model_id, rev),
  CHECK ((rev = 1) = (base_rev IS NULL))
) STRICT, WITHOUT ROWID;

INSERT INTO process_model_revisions_old SELECT * FROM process_model_revisions
  WHERE change IN ('create','branch','save','restore','observe','edit');
DROP TABLE process_model_revisions;
ALTER TABLE process_model_revisions_old RENAME TO process_model_revisions;

CREATE TABLE ba_process_revisions_old (
  process_id TEXT NOT NULL REFERENCES ba_processes(id),
  rev        INTEGER NOT NULL CHECK (rev >= 1),
  base_rev   INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),      -- NULL for r1
  change     TEXT NOT NULL CHECK (change IN ('create','rename','stage','restore','archive','unarchive')),
  author     TEXT NOT NULL CHECK (length(author) > 0),
  name       TEXT NOT NULL CHECK (length(name) > 0),                 -- the values after the change
  stage      TEXT NOT NULL CHECK (stage IN ('scoped','as_is_documented','to_be_design','migrating','migrated')),
  as_is_rev  INTEGER CHECK (as_is_rev IS NULL OR as_is_rev >= 1),    -- the A revision a 'stage' change signed off
  created_at TEXT NOT NULL,
  PRIMARY KEY (process_id, rev),
  CHECK ((rev = 1) = (base_rev IS NULL))
) STRICT, WITHOUT ROWID;

INSERT INTO ba_process_revisions_old SELECT * FROM ba_process_revisions
  WHERE change IN ('create','rename','stage','restore','archive','unarchive');
DROP TABLE ba_process_revisions;
ALTER TABLE ba_process_revisions_old RENAME TO ba_process_revisions;
