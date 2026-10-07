-- 0010_step_stopped (down): back to five statuses; a `stopped` step becomes `failed` (the
-- behaviour before F-04).

CREATE TABLE workflow_steps_old (
  id              TEXT PRIMARY KEY,                                -- UUIDv7
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
  portal_id       TEXT NOT NULL CHECK (length(portal_id) > 0),
  step            TEXT NOT NULL CHECK (step IN ('scan','map','narrow','document','amend')),
  status          TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','pending','in_progress','done','failed')),
  run_id          TEXT REFERENCES runs(id),
  session_id      TEXT REFERENCES analysis_sessions(id),
  error_ref       TEXT,
  started_at      TEXT,
  finished_at     TEXT,
  updated_at      TEXT NOT NULL
) STRICT;
INSERT INTO workflow_steps_old
  SELECT id, conversation_id, portal_id, step,
         CASE status WHEN 'stopped' THEN 'failed' ELSE status END,
         run_id, session_id, error_ref, started_at, finished_at, updated_at
  FROM workflow_steps;
DROP TABLE workflow_steps;
ALTER TABLE workflow_steps_old RENAME TO workflow_steps;
CREATE INDEX idx_workflow_steps_conversation_step ON workflow_steps (conversation_id, step);
