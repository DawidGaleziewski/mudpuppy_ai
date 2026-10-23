# Data model: Workbench (spec 043, R-92)

Migration `data/migrations/0049_workbench.{up,down}.sql` (T012). Zod records: `@mudpuppy/chat-model`
(`src/schemas/workbench.ts`, `chat-conversation.ts`); Kysely types: `store/src/db-types-chat.ts`;
dashboard read models: `apps/dashboard/src/mudpuppy_dashboard/models.py`. All four tables hang off
`chat_conversations` and follow its portal (portal export and delete). Written only by `@mudpuppy/chat`,
read-only for the dashboard. Timestamps are UTC ISO text, ids UUIDv7, JSON columns are TEXT with `json_valid`.

| Table / column | Purpose |
|---|---|
| `chat_conversations.kind` | `chat` (default, the Chat page) or `workbench`. ALTER; old rows are `chat`. |
| `workbench_conversations` | One row per Workbench conversation: `path` (`chat`, `mapping`, `troubleshoot`, `explain`), `path_source` (`assistant`, `you`), renamable `title` (NULL = untitled), `updated_at`. PK `conversation_id`. |
| `workbench_views` | One row per view spec the assistant produced, at most one per turn (`UNIQUE (conversation_id, turn)`). `why` is required; `spec_json` is the checked spec (object), `received_json` the tool input as received, `dropped_json` and `repaired_json` arrays, `fallback` 0/1. |
| `workbench_commands` | Command proposals and, once confirmed, the audit record. `command` in `scan.start`, `scan.resume`, `scan.stop`, `path.attempt`, `mark.add`, `persona.add` (0050, spec 072: an editable card; `args_json` keeps the args as confirmed; Undo sets `undone`); `source` `assistant` or `button`; `state` `proposed`, `running`, `done`, `failed`, `cancelled`, `expired`, `undone`. `token_hash` is the sha256 hex of the one-time confirm token (the token is never stored); `idempotency_key` is unique. CHECKs: past `proposed`/`cancelled`/`expired` needs `confirmed_at` and `confirmed_by` (nothing runs before Confirm); `done` needs `result_json`; `failed` needs `error_ref`. |
| `workbench_feedback` | "Right view?": PK `(view_id, by)`, one answer per view per person, changeable (`updated_at`). `value` `yes` or `no`; `reasons_json` array of `wrong_path`, `missing_something`, `too_much`, `wrong_data`, `other` (Zod enforces the vocabulary, the table only the array shape); optional `text`. `WITHOUT ROWID`. |

Index: `ix_workbench_commands_conversation (conversation_id, created_at)`, for a conversation's commands in
order (the command list and audit). The unique keys serve every other lookup; no further index.
