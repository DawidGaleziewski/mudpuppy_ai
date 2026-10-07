-- 0009_run_owner (down): forget run owners. Every server then treats every running run as its own
-- again (the behaviour before F-14).

ALTER TABLE runs DROP COLUMN owner_pid;
ALTER TABLE runs DROP COLUMN owner_id;
