-- 0045_state_pair_label_history (down): drop the history. state_pair_labels (the current labels) is untouched,
-- so only the superseded answers are lost.
DROP INDEX idx_state_pair_label_history_portal;
DROP INDEX idx_state_pair_label_history_pair;
DROP TABLE state_pair_label_history;
