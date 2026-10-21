-- 0045_state_pair_label_history (up, spec 039 R-81, owner decision 2026-10-21): every "Same screen?" answer for
-- a pair of page versions stays in history. state_pair_labels (0030) keeps ONE row per pair, the current label,
-- and a new answer overwrites label, labelled_by and reason; this table gets one row per answer, so an earlier
-- person's label and reason are never lost (design v2-14: "Marek's label and reason stay in History").
-- Append-only by convention, like amendment_revisions (0016): the code only inserts; no triggers (the repo guards
-- no append-only table with triggers). state_pair_labels is unchanged.
-- id: UUIDv7 text from the app (G-ids); the backfill below has no UUID generator in SQL, so it uses
-- lower(hex(randomblob(16))) as a unique placeholder, ordered by nothing (labelled_at orders the history).
-- Indexes: (state_a, state_b, labelled_at) reads one pair's history (v2-14 History); portal_id lists a portal's.

CREATE TABLE state_pair_label_history (
  id          TEXT PRIMARY KEY,
  portal_id   TEXT NOT NULL CHECK (length(portal_id) > 0),
  state_a     TEXT NOT NULL REFERENCES states(id),
  state_b     TEXT NOT NULL REFERENCES states(id),
  label       TEXT NOT NULL CHECK (label IN ('clone','near_duplicate','distinct')),
  nd_kind     TEXT CHECK (nd_kind IS NULL OR nd_kind IN ('cosmetic','dynamic_data','duplication')),
  labelled_by TEXT NOT NULL CHECK (length(labelled_by) > 0),
  labelled_at TEXT NOT NULL,
  reason      TEXT,
  CHECK (state_a < state_b),
  CHECK (nd_kind IS NULL OR label = 'near_duplicate')
) STRICT;

CREATE INDEX idx_state_pair_label_history_pair ON state_pair_label_history (state_a, state_b, labelled_at);
CREATE INDEX idx_state_pair_label_history_portal ON state_pair_label_history (portal_id);

INSERT INTO state_pair_label_history (id, portal_id, state_a, state_b, label, nd_kind, labelled_by, labelled_at, reason)
SELECT lower(hex(randomblob(16))), portal_id, state_a, state_b, label, nd_kind, labelled_by, labelled_at, reason
FROM state_pair_labels;
