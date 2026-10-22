-- 0049_workbench (down): drop the Workbench tables (children first; the command index goes with its table)
-- and the conversation kind. Workbench conversations stay as ordinary chat rows without their views,
-- commands and feedback; the audit record of confirmed commands is lost.

DROP TABLE workbench_feedback;
DROP TABLE workbench_commands;
DROP TABLE workbench_views;
DROP TABLE workbench_conversations;
ALTER TABLE chat_conversations DROP COLUMN kind;
