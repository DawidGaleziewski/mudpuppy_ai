// The Workbench's turn counter (spec 043 FR-005), shared by the assistant's tools, the words-lane
// events and the HTTP service, so none of them imports another's module for it.

import type BetterSqlite3 from 'better-sqlite3';

/**
 * The turn being answered (FR-005): the person's messages so far plus the event turns (a
 * confirmed command's outcome is a turn of its own, `workbench_event`).
 */
export function currentTurn(raw: BetterSqlite3.Database, conversationId: string): number {
  const row = raw
    .prepare(
      `SELECT count(*) AS n FROM chat_messages WHERE conversation_id = ?
       AND (role = 'user' OR tool_name = 'workbench_event')`,
    )
    .get(conversationId) as { n: number };
  return Math.max(1, row.n);
}
