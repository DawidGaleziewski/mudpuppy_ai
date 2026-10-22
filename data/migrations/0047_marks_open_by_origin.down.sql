-- 0047_marks_open_by_origin (down): restore the one-open-mark-per-target index. A person's and a planner's
-- open mark may now share a target and would break it, so the open planner marks go first (they are rebuilt
-- after every rebuild and replay round).
DELETE FROM marks WHERE origin = 'planner' AND used_by_run_id IS NULL;
DROP INDEX ux_marks_open;
CREATE UNIQUE INDEX ux_marks_open ON marks
  (portal_id, kind, coalesce(form_step_id, state_id, transition_id)) WHERE used_by_run_id IS NULL;
