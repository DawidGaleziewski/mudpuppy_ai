-- 0046_review_decisions (down): drop the wordings and the two event columns. Undo events stay as ordinary
-- events (their to_status is right), only the link to the undone event is lost.
DROP INDEX ix_hypothesis_wordings_hypothesis;
DROP TABLE hypothesis_wordings;
DROP INDEX ix_hypothesis_events_decision;
ALTER TABLE hypothesis_events DROP COLUMN undoes;
ALTER TABLE hypothesis_events DROP COLUMN decision_id;
