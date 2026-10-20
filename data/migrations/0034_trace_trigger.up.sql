-- 0034_trace_trigger (spec 039 T081, R-77 (3) accepted by the owner 2026-10-20): the trace marks
-- its trigger step, the click that enters the process (the menu link or button whose label names
-- it). Steps before it are how the trace reached the process, never its steps: the BA and the
-- process export start there. NULL: the trace marked none (older traces, or none entered).

ALTER TABLE processes ADD COLUMN trigger_ord INTEGER CHECK (trigger_ord IS NULL OR trigger_ord >= 1);
