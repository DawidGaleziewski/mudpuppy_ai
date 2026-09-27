-- 0003_trace (down): drop in reverse FK order (agent_turns and trace_spans reference trace_boots/
-- runs/decision_log/themselves; trace_boots references nothing).
DROP TABLE agent_turns;
DROP TABLE trace_spans;
DROP TABLE trace_boots;
