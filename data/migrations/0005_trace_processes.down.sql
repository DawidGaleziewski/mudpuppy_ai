-- 0005_trace_processes (down): drop in reverse dependency order. Purely additive up, so down is a
-- plain set of drops; no data from other migrations is touched.

DROP TABLE process_steps;
DROP TABLE processes;
