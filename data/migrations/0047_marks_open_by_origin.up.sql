-- 0047_marks_open_by_origin (spec 040 T033): a person's open mark and the planner's open mark on the same
-- target no longer collide; the one-open-mark rule now holds per origin.
DROP INDEX ux_marks_open;
CREATE UNIQUE INDEX ux_marks_open ON marks
  (portal_id, origin, kind, coalesce(form_step_id, state_id, transition_id)) WHERE used_by_run_id IS NULL;
