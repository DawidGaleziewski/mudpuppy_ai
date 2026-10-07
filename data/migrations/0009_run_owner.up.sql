-- 0009_run_owner (up): which pathfinder server process drives a run (spec 010 F-14, T040).
-- Several servers may share one store (a shell session and every chat session start their own), so
-- a server may only mark `interrupted` the runs it owns or whose owner process is gone. Both
-- columns are NULL for runs recorded before this migration; such a running run counts as orphaned.

ALTER TABLE runs ADD COLUMN owner_id  TEXT CHECK (owner_id IS NULL OR length(owner_id) > 0);  -- UUIDv7 of the server instance
ALTER TABLE runs ADD COLUMN owner_pid INTEGER CHECK (owner_pid IS NULL OR owner_pid > 0);     -- its process id, for the liveness check
