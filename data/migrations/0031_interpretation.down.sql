-- 0031_interpretation (down): back to 0030. Interpretation tables go with their rows; `marks` and
-- `open_questions` are rebuilt without their 0031 columns (a column with REFERENCES cannot be
-- dropped), every row kept; the runner has foreign_keys OFF during a migration.

CREATE TABLE marks_old (
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
INSERT INTO marks_old (id, portal_id, kind, target_kind, target_id, created_by, created_at, used_by_run_id, used_at)
SELECT id, portal_id, kind, target_kind, target_id, created_by, created_at, used_by_run_id, used_at FROM marks;
DROP INDEX ux_marks_open;
DROP TABLE marks;
ALTER TABLE marks_old RENAME TO marks;
CREATE UNIQUE INDEX ux_marks_open ON marks (portal_id, kind, target_kind, target_id) WHERE used_by_run_id IS NULL;

CREATE TABLE open_questions_old (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES runs(id),
  text       TEXT NOT NULL,
  about_ref  TEXT NOT NULL,  -- polymorphic (state/edge/form id), validated by the tool, no FK
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','addressed')),
  created_at TEXT NOT NULL
) STRICT;
INSERT INTO open_questions_old (id, run_id, text, about_ref, status, created_at)
SELECT id, run_id, text, about_ref, status, created_at FROM open_questions;
DROP TABLE open_questions;
ALTER TABLE open_questions_old RENAME TO open_questions;

DROP INDEX ix_hypothesis_events_hypothesis;
DROP TABLE hypothesis_events;
DROP INDEX ix_hypothesis_tests_hypothesis;
DROP TABLE hypothesis_tests;
DROP TABLE hypothesis_evidence;
DROP INDEX ix_hypotheses_claim;
DROP INDEX ix_hypotheses_portal_kind;
DROP TABLE hypotheses;
DROP TABLE deviation_occurrences;
DROP INDEX ix_deviations_portal_status;
DROP TABLE deviations;
DROP TABLE entity_refs;
