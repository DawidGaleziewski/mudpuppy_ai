-- 0008_chat_orchestrator (up): guided chat orchestrator state (spec 010, R-30).
-- Conventions: see data/schema/README.md. Written only by @pathfinder/chat; the dashboard reads
-- read-only. These are not Layer B evidence records: no evidence_ref/confidence columns, and
-- amendments are never joined into Layer B records. No indexes beyond the four in
-- specs/010-acp-chat-orchestrator/data-model.md (plus the UNIQUE keys that guarantee identity).

CREATE TABLE chat_conversations (
  id             TEXT PRIMARY KEY,                                 -- UUIDv7
  portal_id      TEXT CHECK (portal_id IS NULL OR length(portal_id) > 0),  -- NULL until the BA chooses a portal; no FK, portals are files
  goal           TEXT NOT NULL,
  acp_session_id TEXT,
  persona_draft  TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(persona_draft) AND json_type(persona_draft) = 'object'),  -- never holds secrets
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
) STRICT;

CREATE TABLE chat_messages (
  id              TEXT PRIMARY KEY,                                -- UUIDv7
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
  seq             INTEGER NOT NULL CHECK (seq >= 0),
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content         TEXT NOT NULL,                                   -- credentials never land here (form path bypasses chat)
  tool_name       TEXT,
  error_ref       TEXT,                                            -- ref into data/logs/chat/*.jsonl
  created_at      TEXT NOT NULL,
  UNIQUE (conversation_id, seq)                                    -- the (conversation_id, seq) index
) STRICT;

CREATE TABLE workflow_steps (
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
CREATE INDEX idx_workflow_steps_conversation_step ON workflow_steps (conversation_id, step);

CREATE TABLE process_scopes (
  id                 TEXT PRIMARY KEY,                             -- UUIDv7
  conversation_id    TEXT NOT NULL REFERENCES chat_conversations(id),
  portal_id          TEXT NOT NULL CHECK (length(portal_id) > 0),
  process_name       TEXT NOT NULL CHECK (length(process_name) > 0),
  persona            TEXT NOT NULL CHECK (length(persona) > 0),
  start_state_id     TEXT NOT NULL REFERENCES states(id),
  end_state_id       TEXT NOT NULL REFERENCES states(id),
  selected_state_ids TEXT NOT NULL CHECK (json_valid(selected_state_ids) AND json_type(selected_state_ids) = 'array'),
  comments           TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(comments) AND json_type(comments) = 'object'),  -- state_id -> text
  source             TEXT NOT NULL CHECK (source IN ('agent_proposal','ba_description')),
  created_at         TEXT NOT NULL
) STRICT;

CREATE TABLE amendments (
  id                TEXT PRIMARY KEY,                              -- UUIDv7
  key               TEXT NOT NULL CHECK (key GLOB 'AMD-[0-9][0-9][0-9]*'),  -- AMD-nnn, per portal
  portal_id         TEXT NOT NULL CHECK (length(portal_id) > 0),
  scope_id          TEXT REFERENCES process_scopes(id),
  target_kind       TEXT NOT NULL CHECK (target_kind IN ('state','evidence','wireframe_element')),
  target_id         TEXT NOT NULL CHECK (length(target_id) > 0),   -- polymorphic, no FK; the write tool resolves it
  kind              TEXT NOT NULL CHECK (kind IN ('note','element_ref','attachment')),
  text              TEXT,
  attachment_sha256 TEXT CHECK (attachment_sha256 IS NULL OR length(attachment_sha256) = 64),
  attachment_name   TEXT,
  author            TEXT NOT NULL CHECK (length(author) > 0),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','dismissed','withdrawn')),
  anchor_fingerprint    TEXT,                                      -- fingerprint of the state when written
  anchor_route_template TEXT,
  anchor_element    TEXT CHECK (anchor_element IS NULL OR (json_valid(anchor_element) AND json_type(anchor_element) = 'object')),  -- role, accessible name, wireframe element id
  superseded_by_run TEXT REFERENCES runs(id),
  superseded_reason TEXT CHECK (superseded_reason IS NULL OR superseded_reason IN ('state_replaced','element_changed','element_removed')),
  superseded_detail TEXT,                                          -- short text for superseded_reason
  superseded_at     TEXT,
  dismissed_at      TEXT,
  reapplied_as      TEXT REFERENCES amendments(id),                -- the new active copy
  reapplies         TEXT REFERENCES amendments(id),                -- the original this row copies
  created_at        TEXT NOT NULL,
  withdrawn_at      TEXT,
  UNIQUE (portal_id, key),
  CHECK (kind <> 'note' OR text IS NOT NULL),
  CHECK (kind <> 'attachment' OR (attachment_sha256 IS NOT NULL AND attachment_name IS NOT NULL)),
  CHECK (status <> 'superseded' OR (superseded_at IS NOT NULL AND superseded_reason IS NOT NULL)),
  CHECK (status <> 'dismissed' OR dismissed_at IS NOT NULL),
  CHECK (status <> 'withdrawn' OR withdrawn_at IS NOT NULL)
) STRICT;
CREATE INDEX idx_amendments_target ON amendments (portal_id, target_kind, target_id);
CREATE INDEX idx_amendments_status ON amendments (portal_id, status);
