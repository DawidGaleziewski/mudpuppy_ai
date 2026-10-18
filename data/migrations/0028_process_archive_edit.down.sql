-- 0028_process_archive_edit (down): back to 0027. The older tables have no archive state or sign-off
-- coverage: 'archive' / 'unarchive' process revisions are dropped (a process head may then point past its
-- last revision row; the down is for a dev store), an 'edit' A revision is kept as a 'save' so later A
-- revisions still build on it, and archived_at and record_key go (DROP COLUMN works on a column with a
-- column-level CHECK of its own).

CREATE TABLE ba_process_revisions_old (
  process_id TEXT NOT NULL REFERENCES ba_processes(id),
  rev        INTEGER NOT NULL CHECK (rev >= 1),
  base_rev   INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),      -- NULL for r1
  change     TEXT NOT NULL CHECK (change IN ('create','rename','stage','restore')),
  author     TEXT NOT NULL CHECK (length(author) > 0),
  name       TEXT NOT NULL CHECK (length(name) > 0),                 -- the values after the change
  stage      TEXT NOT NULL CHECK (stage IN ('scoped','as_is_documented','to_be_design','migrating','migrated')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (process_id, rev),
  CHECK ((rev = 1) = (base_rev IS NULL))
) STRICT, WITHOUT ROWID;

INSERT INTO ba_process_revisions_old (process_id, rev, base_rev, change, author, name, stage, created_at)
SELECT process_id, rev, base_rev, change, author, name, stage, created_at FROM ba_process_revisions
WHERE change NOT IN ('archive', 'unarchive');

DROP TABLE ba_process_revisions;
ALTER TABLE ba_process_revisions_old RENAME TO ba_process_revisions;

CREATE TABLE process_variant_revisions_old (
  variant_id    TEXT NOT NULL REFERENCES process_variants(id),
  rev           INTEGER NOT NULL CHECK (rev >= 1),
  base_rev      INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),   -- NULL for r1
  change        TEXT NOT NULL CHECK (change IN ('create','branch','save','restore','observe')),
  author        TEXT NOT NULL CHECK (length(author) > 0),            -- reviewer name, or 'scan:<run id>' for observe
  steps         TEXT NOT NULL CHECK (json_valid(steps) AND json_type(steps) = 'array'),  -- ordered ProcessStep objects
  note          TEXT,                                                -- the one line the history shows
  run_id        TEXT REFERENCES runs(id),                            -- for observe
  restored_from INTEGER CHECK (restored_from IS NULL OR restored_from >= 1),  -- for restore
  created_at    TEXT NOT NULL,
  PRIMARY KEY (variant_id, rev),
  CHECK ((rev = 1) = (base_rev IS NULL))
) STRICT, WITHOUT ROWID;

INSERT INTO process_variant_revisions_old
  (variant_id, rev, base_rev, change, author, steps, note, run_id, restored_from, created_at)
SELECT variant_id, rev, base_rev,
       CASE change WHEN 'edit' THEN 'save' ELSE change END,
       author, steps, note, run_id, restored_from, created_at
FROM process_variant_revisions;

DROP TABLE process_variant_revisions;
ALTER TABLE process_variant_revisions_old RENAME TO process_variant_revisions;

ALTER TABLE ba_processes DROP COLUMN archived_at;
ALTER TABLE ba_processes DROP COLUMN record_key;
