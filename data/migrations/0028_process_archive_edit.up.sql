-- 0028_process_archive_edit (up): processes, as-is first (spec 027, R-54). Nothing in a process table is ever
-- deleted (FR-003): a process created by mistake is archived (ba_processes.archived_at, NULL = in the list) and
-- restored, each a process revision ('archive', 'unarchive'); a stage sign-off records the A revision it covers
-- (ba_process_revisions.as_is_rev, FR-005); a person's edit of A's steps is an A revision ('edit', FR-004);
-- a process opened from a BA `process` record keeps that record's key (ba_processes.record_key, US6), so a
-- second "Open in Processes" finds it instead of making another.
-- The two CHECK lists change, so both revision tables are rebuilt with every row kept (the runner has
-- foreign_keys OFF during a migration, as 0026's down relies on); the tables that reference
-- process_variant_revisions by name keep referencing the rebuilt one. No index: the list reads every process
-- of a portal already.

ALTER TABLE ba_processes ADD COLUMN archived_at TEXT;
ALTER TABLE ba_processes ADD COLUMN record_key TEXT CHECK (record_key IS NULL OR record_key GLOB 'PROC-[0-9]*');

CREATE TABLE ba_process_revisions_new (
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

INSERT INTO ba_process_revisions_new (process_id, rev, base_rev, change, author, name, stage, as_is_rev, created_at)
SELECT process_id, rev, base_rev, change, author, name, stage, NULL, created_at FROM ba_process_revisions;

DROP TABLE ba_process_revisions;
ALTER TABLE ba_process_revisions_new RENAME TO ba_process_revisions;

CREATE TABLE process_variant_revisions_new (
  variant_id    TEXT NOT NULL REFERENCES process_variants(id),
  rev           INTEGER NOT NULL CHECK (rev >= 1),
  base_rev      INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),   -- NULL for r1
  change        TEXT NOT NULL CHECK (change IN ('create','branch','save','restore','observe','edit')),
  author        TEXT NOT NULL CHECK (length(author) > 0),            -- reviewer name, or 'scan:<run id>' for observe
  steps         TEXT NOT NULL CHECK (json_valid(steps) AND json_type(steps) = 'array'),  -- ordered ProcessStep objects
  note          TEXT,                                                -- the one line the history shows
  run_id        TEXT REFERENCES runs(id),                            -- for observe
  restored_from INTEGER CHECK (restored_from IS NULL OR restored_from >= 1),  -- for restore
  created_at    TEXT NOT NULL,
  PRIMARY KEY (variant_id, rev),
  CHECK ((rev = 1) = (base_rev IS NULL))
) STRICT, WITHOUT ROWID;

INSERT INTO process_variant_revisions_new
  (variant_id, rev, base_rev, change, author, steps, note, run_id, restored_from, created_at)
SELECT variant_id, rev, base_rev, change, author, steps, note, run_id, restored_from, created_at
FROM process_variant_revisions;

DROP TABLE process_variant_revisions;
ALTER TABLE process_variant_revisions_new RENAME TO process_variant_revisions;
