-- 0046_review_decisions (up, spec 040 T010 / T014, designer 12-v2-ux.md § 5.4, § 5.8, § 7.1): Undo and Reword.
-- hypothesis_events.decision_id: the one command a person's decision came in (a bulk decision of 12 items is one
--   command, one Undo, § 5.4). NULL for machine events and decisions before 0046.
-- hypothesis_events.undoes: the event this one reverts (Undo appends, never deletes: Principle VI). The undo
--   event's to_status is the undone event's from_status. NULL for every other event.
-- hypothesis_wordings: a person's Reword of a rule, the sentence that goes into the documentation (§ 7.1).
--   Append-only by convention; the latest row is the wording in force.
-- Indexes: decision_id finds a command's events for Undo; (hypothesis_id, at) reads a rule's wording history.

ALTER TABLE hypothesis_events ADD COLUMN decision_id TEXT CHECK (decision_id IS NULL OR length(decision_id) > 0);
-- No REFERENCES on `undoes`: SQLite cannot DROP a column used in a foreign key, so the down would fail; the
-- store writes it only with an event id it just read.
ALTER TABLE hypothesis_events ADD COLUMN undoes TEXT CHECK (undoes IS NULL OR length(undoes) > 0);
CREATE INDEX ix_hypothesis_events_decision ON hypothesis_events (decision_id) WHERE decision_id IS NOT NULL;

CREATE TABLE hypothesis_wordings (
  id            TEXT PRIMARY KEY,                                   -- UUIDv7
  hypothesis_id TEXT NOT NULL REFERENCES hypotheses(id),
  wording       TEXT NOT NULL CHECK (length(wording) > 0 AND length(wording) <= 2000),
  actor         TEXT NOT NULL CHECK (length(actor) > 0),
  reason        TEXT,
  at            TEXT NOT NULL
) STRICT;
CREATE INDEX ix_hypothesis_wordings_hypothesis ON hypothesis_wordings (hypothesis_id, at);
