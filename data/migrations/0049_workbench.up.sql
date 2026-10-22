-- 0049_workbench (up): spec 043 (R-92, the Workbench / generative UI beta), FR-005, FR-010, FR-012, D-2, D-4.
-- chat_conversations gets a kind ('chat' = the Chat page, 'workbench' = a Workbench conversation); old rows
-- are 'chat' through the DEFAULT. Four tables hang off the conversation, so they follow its portal (portal
-- export and delete): workbench_conversations (path and title), workbench_views (one checked view spec per
-- assistant turn, with what was received, dropped and repaired), workbench_commands (command proposals and,
-- once confirmed, their audit record; only a hash of the one-time confirm token is stored) and
-- workbench_feedback ("Right view?", one answer per view per person).
-- One index, for the one named read: a conversation's commands in order (command drawer / audit list).
-- No other index: the unique keys on views and commands already serve the other lookups.

ALTER TABLE chat_conversations ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat','workbench'));

CREATE TABLE workbench_conversations (
  conversation_id TEXT PRIMARY KEY REFERENCES chat_conversations(id),
  path            TEXT NOT NULL DEFAULT 'chat' CHECK (path IN ('chat','mapping','troubleshoot','explain')),
  path_source     TEXT NOT NULL DEFAULT 'assistant' CHECK (path_source IN ('assistant','you')),  -- who chose the path
  title           TEXT CHECK (title IS NULL OR length(title) > 0),                               -- renamable; NULL = untitled
  updated_at      TEXT NOT NULL
) STRICT;

CREATE TABLE workbench_views (
  id              TEXT PRIMARY KEY,                                  -- UUIDv7
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
  turn            INTEGER NOT NULL CHECK (turn >= 1),
  path            TEXT NOT NULL CHECK (path IN ('chat','mapping','troubleshoot','explain')),
  why             TEXT NOT NULL CHECK (length(why) > 0),             -- why the assistant chose this view
  spec_json       TEXT NOT NULL CHECK (json_valid(spec_json) AND json_type(spec_json) = 'object'),  -- the checked spec
  received_json   TEXT NOT NULL CHECK (json_valid(received_json)),   -- the tool input as received
  dropped_json    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(dropped_json) AND json_type(dropped_json) = 'array'),
  repaired_json   TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(repaired_json) AND json_type(repaired_json) = 'array'),
  fallback        INTEGER NOT NULL DEFAULT 0 CHECK (fallback IN (0,1)),  -- 1 = the fallback view replaced the spec
  created_at      TEXT NOT NULL,
  UNIQUE (conversation_id, turn)                                     -- at most one view per turn
) STRICT;

CREATE TABLE workbench_commands (
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
CREATE INDEX ix_workbench_commands_conversation ON workbench_commands (conversation_id, created_at);

CREATE TABLE workbench_feedback (
  view_id      TEXT NOT NULL REFERENCES workbench_views(id),
  by           TEXT NOT NULL CHECK (length(by) > 0),
  value        TEXT NOT NULL CHECK (value IN ('yes','no')),
  reasons_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(reasons_json) AND json_type(reasons_json) = 'array'),  -- wrong_path, missing_something, too_much, wrong_data, other
  text         TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,                                        -- an answer can be changed
  PRIMARY KEY (view_id, by)
) STRICT, WITHOUT ROWID;
