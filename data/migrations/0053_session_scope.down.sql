-- 0053_session_scope (down): back to the schema before 0053; sessions forget their process scope.

ALTER TABLE analysis_sessions DROP COLUMN scope_id;
