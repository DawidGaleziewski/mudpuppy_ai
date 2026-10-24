-- 0051_process_scope_merge (up): spec 078 (R-106, designer T-05 / T-06). Adding screens to a process is a scope
-- change (A rebuilt, 'scope'); merging two saved processes rebuilds the kept one's A ('merge') and undoing or
-- splitting back puts it back ('unmerge'). The CHECK lists of process_model_revisions.change and
-- ba_process_revisions.change grow, so both tables are rebuilt with every row kept (the runner has
-- foreign_keys OFF during a migration, as 0050 relies on). Neither table has an index besides its primary key.
-- Two new tables: process_scope_screens (screens in the scope that no observed move reaches yet) and
-- process_merges (enough to undo or split back a merge).

CREATE TABLE process_model_revisions_new (
  model_id      TEXT NOT NULL REFERENCES process_models(id),
  rev           INTEGER NOT NULL CHECK (rev >= 1),
  base_rev      INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),   -- NULL for r1
  change        TEXT NOT NULL CHECK (change IN ('create','branch','save','restore','observe','edit','scope','merge','unmerge')),
  author        TEXT NOT NULL CHECK (length(author) > 0),            -- reviewer name, or 'scan:<run id>' for observe
  steps         TEXT NOT NULL CHECK (json_valid(steps) AND json_type(steps) = 'array'),  -- ordered ProcessStep objects
  note          TEXT,                                                -- the one line the history shows
  run_id        TEXT REFERENCES runs(id),                            -- for observe
  restored_from INTEGER CHECK (restored_from IS NULL OR restored_from >= 1),  -- for restore
  created_at    TEXT NOT NULL,
  PRIMARY KEY (model_id, rev),
  CHECK ((rev = 1) = (base_rev IS NULL))
) STRICT, WITHOUT ROWID;

INSERT INTO process_model_revisions_new SELECT * FROM process_model_revisions;
DROP TABLE process_model_revisions;
ALTER TABLE process_model_revisions_new RENAME TO process_model_revisions;

CREATE TABLE ba_process_revisions_new (
  process_id TEXT NOT NULL REFERENCES ba_processes(id),
  rev        INTEGER NOT NULL CHECK (rev >= 1),
  base_rev   INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),      -- NULL for r1
  change     TEXT NOT NULL CHECK (change IN ('create','rename','stage','restore','archive','unarchive','merge','unmerge')),
  author     TEXT NOT NULL CHECK (length(author) > 0),
  name       TEXT NOT NULL CHECK (length(name) > 0),                 -- the values after the change
  stage      TEXT NOT NULL CHECK (stage IN ('scoped','as_is_documented','to_be_design','migrating','migrated')),
  as_is_rev  INTEGER CHECK (as_is_rev IS NULL OR as_is_rev >= 1),    -- the A revision a 'stage' change signed off
  created_at TEXT NOT NULL,
  PRIMARY KEY (process_id, rev),
  CHECK ((rev = 1) = (base_rev IS NULL))
) STRICT, WITHOUT ROWID;

INSERT INTO ba_process_revisions_new SELECT * FROM ba_process_revisions;
DROP TABLE ba_process_revisions;
ALTER TABLE ba_process_revisions_new RENAME TO ba_process_revisions;

-- Screens a person added to a process's scope that no observed move reaches yet: in the scope, in no step of A.
CREATE TABLE process_scope_screens (
  id         TEXT PRIMARY KEY,                                       -- UUIDv7
  process_id TEXT NOT NULL REFERENCES ba_processes(id),
  state_id   TEXT NOT NULL REFERENCES states(id),                    -- the screen's recorded state (as A's steps name it)
  author     TEXT NOT NULL CHECK (length(author) > 0),
  added_at   TEXT NOT NULL,
  removed_at TEXT,                                                   -- Undo, or it joined A after a later scan
  removed_by TEXT,
  CHECK ((removed_at IS NULL) = (removed_by IS NULL))
) STRICT;

CREATE UNIQUE INDEX ux_process_scope_screens_open ON process_scope_screens (process_id, state_id) WHERE removed_at IS NULL;

-- One merge of two saved processes of the same persona: one absorbs the other.
CREATE TABLE process_merges (
  id                    TEXT PRIMARY KEY,                            -- UUIDv7
  portal_id             TEXT NOT NULL CHECK (length(portal_id) > 0),
  kept_process_id       TEXT NOT NULL REFERENCES ba_processes(id),   -- keeps its key, links, rules, docs
  absorbed_process_id   TEXT NOT NULL REFERENCES ba_processes(id),   -- archived as "Merged into ..."
  author                TEXT NOT NULL CHECK (length(author) > 0),
  reason                TEXT,
  kept_name_before      TEXT NOT NULL CHECK (length(kept_name_before) > 0),
  kept_as_is_rev_before INTEGER NOT NULL CHECK (kept_as_is_rev_before >= 1),  -- A's head before the merge
  kept_as_is_rev_after  INTEGER NOT NULL CHECK (kept_as_is_rev_after >= 1),   -- the A revision the merge wrote
  moved_json            TEXT NOT NULL CHECK (json_valid(moved_json) AND json_type(moved_json) = 'array'),  -- [{model_id, from_label, to_label}]
  created_at            TEXT NOT NULL,
  undone_at             TEXT,                                        -- Undo or Split back
  undone_by             TEXT,
  CHECK (kept_process_id <> absorbed_process_id),
  CHECK ((undone_at IS NULL) = (undone_by IS NULL))
) STRICT;

CREATE UNIQUE INDEX ux_process_merges_absorbed_open ON process_merges (absorbed_process_id) WHERE undone_at IS NULL;
