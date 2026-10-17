-- 0024_marks (up): a person's instruction on a map target for the next scan (spec 032 US5, FR-014..FR-016).
-- Only kind 'probe' is written in spec 032; the other kinds are for R-69 (5) and R-66. target_id has no FK:
-- it is polymorphic by target_kind. Index: only the open marks of a portal (one open mark per target and kind).

CREATE TABLE marks (
  id             TEXT PRIMARY KEY,                                   -- UUIDv7
  portal_id      TEXT NOT NULL CHECK (length(portal_id) > 0),
  kind           TEXT NOT NULL CHECK (kind IN ('start','focus','probe','retry','recheck','skip')),
  target_kind    TEXT NOT NULL CHECK (target_kind IN ('form_step','state','edge')),
  target_id      TEXT NOT NULL CHECK (length(target_id) > 0),
  created_by     TEXT NOT NULL CHECK (length(created_by) > 0),       -- the person (reviewer name)
  created_at     TEXT NOT NULL,
  used_by_run_id TEXT REFERENCES runs(id),                           -- set when a scan used the mark
  used_at        TEXT,
  CHECK ((used_by_run_id IS NULL) = (used_at IS NULL))
) STRICT;

CREATE UNIQUE INDEX ux_marks_open ON marks (portal_id, kind, target_kind, target_id) WHERE used_by_run_id IS NULL;
