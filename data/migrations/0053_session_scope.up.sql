-- 0053_session_scope (up, spec 080 FR-007, R-99 (1)): a BA session started for one process scope
-- (a documentation request from the chat) remembers it, so the record tools refuse evidence off the
-- scope's states. NULL: the session documents the whole portal (every session before 0053).

ALTER TABLE analysis_sessions ADD COLUMN scope_id TEXT REFERENCES process_scopes(id);
