// The command cards' timer pass (spec 043 T016), moved out of workbench-commands.ts (spec 072,
// G-01 size): proposals past 10 minutes expire; a confirmed start or resume is done once its run is
// in the store, or failed when none came.

import type BetterSqlite3 from 'better-sqlite3';
import {
  commandPortal,
  getCommand,
  setCommandState,
  START_WAIT_MS,
  type CommandRow,
} from './workbench-commands.js';

/** The timer's pass (every 2 s with the step recorder); returns the commands whose state changed. */
export function settleCommands(raw: BetterSqlite3.Database, now = Date.now()): CommandRow[] {
  const changed: CommandRow[] = [];
  const open = raw
    .prepare(`SELECT * FROM workbench_commands WHERE state IN ('proposed', 'running')`)
    .all() as CommandRow[];
  for (const row of open) {
    if (row.state === 'proposed' && Date.parse(row.expires_at) <= now) {
      setCommandState(raw, row.id, 'expired', {
        result_json: JSON.stringify({ why: 'it was proposed more than 10 minutes ago' }),
      });
      changed.push(getCommand(raw, row.id));
    } else if (row.state === 'running' && row.confirmed_at !== null) {
      const started = startedRun(raw, row);
      if (started !== null) {
        setCommandState(raw, row.id, 'done', { result_json: JSON.stringify({ run_id: started }) });
        changed.push(getCommand(raw, row.id));
      } else if (Date.parse(row.confirmed_at) + START_WAIT_MS <= now) {
        setCommandState(raw, row.id, 'failed', {
          error_ref: `WB-${row.id.slice(-8)}`,
          result_json: JSON.stringify({ message: 'the crawler did not start a scan' }),
        });
        changed.push(getCommand(raw, row.id));
      }
    }
  }
  return changed;
}

/** The run a confirmed start or resume produced: the portal's first run since the confirm. */
function startedRun(raw: BetterSqlite3.Database, row: CommandRow): string | null {
  const portal = commandPortal(raw, row.conversation_id);
  const found = raw
    .prepare(
      `SELECT id FROM runs WHERE portal_id = ? AND started_at >= ? ORDER BY started_at LIMIT 1`,
    )
    .get(portal, row.confirmed_at) as { id: string } | undefined;
  return found?.id ?? null;
}
