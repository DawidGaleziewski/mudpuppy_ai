-- 0008_chat_orchestrator (down): drop the chat orchestrator tables, children first. Conversations,
-- workflow steps, scopes and amendments are lost.

DROP TABLE amendments;
DROP TABLE process_scopes;
DROP TABLE workflow_steps;
DROP TABLE chat_messages;
DROP TABLE chat_conversations;
