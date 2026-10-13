-- 0017_chat_proposals (up): changes the chat assistant proposes and a person applies or discards.
-- Spec 022 research.md R6 "Proposals". The assistant never writes amendments; applying runs the same
-- revision write path as a BA edit (base check: a moved head turns the proposal 'stale').
-- Two indexes, each for a named read: a conversation's proposals (drawer) and the portal's open
-- proposals (Review inbox).

CREATE TABLE chat_proposals (
  id                    TEXT PRIMARY KEY,                          -- UUIDv7
  conversation_id       TEXT NOT NULL REFERENCES chat_conversations(id),
  portal_id             TEXT NOT NULL CHECK (length(portal_id) > 0),
  target_kind           TEXT NOT NULL CHECK (target_kind IN ('amendment','new_amendment')),  -- amendment = edit text / re-anchor; new_amendment = create
  target_id             TEXT CHECK (target_id IS NULL OR length(target_id) > 0),  -- the amendment id; NULL for new_amendment (no FK, like amendments.target_id)
  base_rev              INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),         -- the amendment revision the proposal was made on; NULL for new_amendment
  payload               TEXT NOT NULL CHECK (json_valid(payload) AND json_type(payload) = 'object'),  -- what to change, e.g. {"text": "..."}
  summary               TEXT NOT NULL CHECK (length(summary) > 0),  -- the one line the drawer shows
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','applied','discarded','stale')),
  applied_amendment_id  TEXT REFERENCES amendments(id),            -- the created or changed amendment
  applied_rev           INTEGER CHECK (applied_rev IS NULL OR applied_rev >= 1),  -- the revision that applying created
  decided_by            TEXT,
  decided_at            TEXT,
  created_at            TEXT NOT NULL,
  CHECK ((target_kind = 'amendment' AND target_id IS NOT NULL AND base_rev IS NOT NULL)
      OR (target_kind = 'new_amendment' AND target_id IS NULL AND base_rev IS NULL)),
  CHECK (status <> 'applied' OR (applied_amendment_id IS NOT NULL AND applied_rev IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (status NOT IN ('discarded','stale') OR decided_at IS NOT NULL)
) STRICT;

CREATE INDEX ix_chat_proposals_conversation ON chat_proposals (conversation_id, created_at);
CREATE INDEX ix_chat_proposals_portal_status ON chat_proposals (portal_id, status);
