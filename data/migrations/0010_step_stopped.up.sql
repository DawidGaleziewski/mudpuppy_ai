-- 0010_step_stopped (up): a workflow step the BA stopped is `stopped`, not `failed` (spec 011
-- FR-015, F-04). [stop] and [stop scan] interrupt the run on purpose: the tracker shows it as
-- stopped with a way to resume, and no error reference is made. SQLite cannot alter a CHECK, so
-- the table is rebuilt (nothing references it); rows and the index are kept.

CREATE TABLE workflow_steps_new (
  id              TEXT PRIMARY KEY,                                -- UUIDv7
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
  portal_id       TEXT NOT NULL CHECK (length(portal_id) > 0),
  step            TEXT NOT NULL CHECK (step IN ('scan','map','narrow','document','amend')),
  status          TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','pending','in_progress','done','failed','stopped')),
  run_id          TEXT REFERENCES runs(id),
  session_id      TEXT REFERENCES analysis_sessions(id),
  error_ref       TEXT,
  started_at      TEXT,
  finished_at     TEXT,
  updated_at      TEXT NOT NULL
) STRICT;
INSERT INTO workflow_steps_new SELECT * FROM workflow_steps;
DROP TABLE workflow_steps;
ALTER TABLE workflow_steps_new RENAME TO workflow_steps;
CREATE INDEX idx_workflow_steps_conversation_step ON workflow_steps (conversation_id, step);
