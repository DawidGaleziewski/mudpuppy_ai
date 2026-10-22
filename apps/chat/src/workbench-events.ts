// Workbench words-lane events (spec 043 T017, contracts/workbench-http.md): what the dashboard needs
// to show a turn, read off the agent's own tool events. A `render_view` call that opens is
// "composing" (the frame appears at its final size, WB-UI-29); when it ends, the stored view (or
// none); a `propose_command` that ends is the new command card.

import type BetterSqlite3 from 'better-sqlite3';
import type { ChatEvent } from './events.js';
import { currentTurn } from './workbench-turn.js';

const RENDER = 'mcp__mudpuppy-chat__render_view';
const PROPOSE = 'mcp__mudpuppy-chat__propose_command';

export function observeWorkbench(
  raw: BetterSqlite3.Database,
  conversationId: string,
  event: ChatEvent,
): ChatEvent[] {
  if (event.type !== 'tool_started' && event.type !== 'tool_finished') return [];
  if (event.parentToolCallId !== null) return [];
  const turn = currentTurn(raw, conversationId);
  if (event.tool === RENDER) {
    if (event.type === 'tool_started') return [{ type: 'wb_composing', turn }];
    const view = raw
      .prepare(`SELECT id, fallback FROM workbench_views WHERE conversation_id = ? AND turn = ?`)
      .get(conversationId, turn) as { id: string; fallback: number } | undefined;
    return view === undefined
      ? [{ type: 'wb_no_view', turn }]
      : [{ type: 'wb_view', turn, viewId: view.id, fallback: view.fallback === 1 }];
  }
  if (event.tool === PROPOSE && event.type === 'tool_finished' && event.status === 'completed') {
    const command = raw
      .prepare(
        `SELECT id, state FROM workbench_commands WHERE conversation_id = ? AND turn = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(conversationId, turn) as { id: string; state: string } | undefined;
    return command === undefined
      ? []
      : [{ type: 'wb_command', id: command.id, state: command.state }];
  }
  return [];
}

/** True for a Workbench conversation (`chat_conversations.kind`). */
export function isWorkbench(raw: BetterSqlite3.Database, conversationId: string): boolean {
  const row = raw
    .prepare(`SELECT kind FROM chat_conversations WHERE id = ?`)
    .get(conversationId) as { kind: string } | undefined;
  return row?.kind === 'workbench';
}
