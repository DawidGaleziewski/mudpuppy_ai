-- 0050_workbench_persona_add (down): back to 0049's command list. persona.add rows have no place in it and
-- are dropped (their personas stay as files); every other row is kept.

CREATE TABLE workbench_commands_old (
  id              TEXT PRIMARY KEY,                                  -- UUIDv7
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
  turn            INTEGER NOT NULL CHECK (turn >= 1),
  command         TEXT NOT NULL CHECK (command IN ('scan.start','scan.resume','scan.stop','path.attempt','mark.add')),
  args_json       TEXT NOT NULL CHECK (json_valid(args_json) AND json_type(args_json) = 'object'),
  reason          TEXT NOT NULL CHECK (length(reason) > 0),
  source          TEXT NOT NULL CHECK (source IN ('assistant','button')),
  state           TEXT NOT NULL DEFAULT 'proposed'
                  CHECK (state IN ('proposed','running','done','failed','cancelled','expired','undone')),
  token_hash      TEXT NOT NULL CHECK (length(token_hash) = 64),     -- sha256 hex of the one-time confirm token; the token is never stored
  precondition_hash TEXT NOT NULL,                                   -- state the proposal assumed; a change refuses the confirm
  idempotency_key TEXT NOT NULL UNIQUE,
  expires_at      TEXT NOT NULL,
  confirmed_by    TEXT,
  confirmed_at    TEXT,
  result_json     TEXT CHECK (result_json IS NULL OR (json_valid(result_json) AND json_type(result_json) = 'object')),  -- e.g. the started run id
  error_ref       TEXT,                                              -- reference into the chat error log
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  -- nothing runs before Confirm: past proposed/cancelled/expired a person has confirmed
  CHECK (state IN ('proposed','cancelled','expired') OR (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)),
  CHECK (state <> 'done' OR result_json IS NOT NULL),
  CHECK (state <> 'failed' OR error_ref IS NOT NULL)
) STRICT;

INSERT INTO workbench_commands_old SELECT * FROM workbench_commands WHERE command <> 'persona.add';

DROP TABLE workbench_commands;
ALTER TABLE workbench_commands_old RENAME TO workbench_commands;
CREATE INDEX ix_workbench_commands_conversation ON workbench_commands (conversation_id, created_at);
