// The command cards' timer pass (spec 043 T016), moved out of workbench-commands.ts (spec 072,
// G-01 size): proposals past 10 minutes expire; a confirmed start or resume is done once its own
// workflow step follows a run, or failed when that step failed or no run came (spec 073 FR-001: a
// command never takes another command's run).

import type BetterSqlite3 from 'better-sqlite3';
import type { ChatEvent } from './events.js';
import {
  getCommand,
  setCommandState,
  START_WAIT_MS,
  type CommandRow,
} from './workbench-commands.js';

const NO_SCAN = 'the crawler did not start a scan';

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
    } else if (row.state === 'running' && row.confirmed_at !== null && settleStart(raw, row, row.confirmed_at, now)) {
      changed.push(getCommand(raw, row.id));
    }
  }
  return changed;
}

/** A confirmed start's end, if it has one: true when its state changed. */
function settleStart(raw: BetterSqlite3.Database, row: CommandRow, confirmedAt: string, now: number): boolean {
  const fail = (message: string, errorRef?: string | null): true => {
    setCommandState(raw, row.id, 'failed', {
      error_ref: errorRef ?? `WB-${row.id.slice(-8)}`,
      result_json: JSON.stringify({ message }),
    });
    return true;
  };
  // A later start reuses the conversation's scan step: this one never takes its run.
  if (laterStart(raw, row)) return fail(`${NO_SCAN} before the next start was confirmed`);
  const step = stepOf(raw, row);
  if (step !== null && step.run !== null && ranSince(raw, step.run, confirmedAt)) {
    setCommandState(raw, row.id, 'done', { result_json: JSON.stringify({ run_id: step.run }) });
    return true;
  }
  if (step?.status === 'failed') return fail(NO_SCAN, step.errorRef);
  if (Date.parse(confirmedAt) + START_WAIT_MS <= now) return fail(NO_SCAN);
  return false;
}

/**
 * A scan step that failed before its run started fails the conversation's confirmed start at once,
 * with the step's message (the crawler's `start_run` refusal) and its error reference; returns the
 * commands it failed. Runs on the step recorder's events, before the next start can reuse the step.
 */
export function failStarts(
  raw: BetterSqlite3.Database,
  conversationId: string,
  events: readonly ChatEvent[],
): CommandRow[] {
  const failed: CommandRow[] = [];
  for (const e of events) {
    if (e.type !== 'step_changed' || e.status !== 'failed' || e.errorRef === null) continue;
    if (e.step !== 'scan' && e.step !== 'map') continue;
    for (const row of runningStarts(raw, conversationId)) {
      const step = stepOf(raw, row);
      if (step !== null && step.run !== null && ranSince(raw, step.run, row.confirmed_at ?? ''))
        continue; // its run started: the timer settles it
      setCommandState(raw, row.id, 'failed', {
        error_ref: e.errorRef,
        result_json: JSON.stringify({ message: e.message ?? NO_SCAN }),
      });
      failed.push(getCommand(raw, row.id));
    }
  }
  return failed;
}

function runningStarts(raw: BetterSqlite3.Database, conversationId: string): CommandRow[] {
  return raw
    .prepare(
      `SELECT * FROM workbench_commands WHERE conversation_id = ? AND state = 'running'
         AND confirmed_at IS NOT NULL AND command IN ('scan.start', 'scan.resume')`,
    )
    .all(conversationId) as CommandRow[];
}

function laterStart(raw: BetterSqlite3.Database, row: CommandRow): boolean {
  if (row.command !== 'scan.start' && row.command !== 'scan.resume') return false;
  return (
    raw
      .prepare(
        `SELECT 1 FROM workbench_commands WHERE conversation_id = ? AND id <> ?
           AND command IN ('scan.start', 'scan.resume') AND confirmed_at > ? LIMIT 1`,
      )
      .get(row.conversation_id, row.id, row.confirmed_at) !== undefined
  );
}

interface StepLink {
  run: string | null;
  status: string;
  errorRef: string | null;
}

/** The scan step the command's confirm requested (written at the confirm, so not older). */
function stepOf(raw: BetterSqlite3.Database, row: CommandRow): StepLink | null {
  const found = raw
    .prepare(
      `SELECT run_id AS run, status, error_ref AS errorRef FROM workflow_steps
       WHERE conversation_id = ? AND step IN ('scan', 'map') AND updated_at >= ?
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(row.conversation_id, row.confirmed_at) as StepLink | undefined;
  return found ?? null;
}

/**
 * The step's run is this command's: a new run started after the confirm, or the resumed run
 * running (or ended) again since. A resume links its run at once, before the crawler restarts it.
 */
function ranSince(raw: BetterSqlite3.Database, runId: string, since: string): boolean {
  const run = raw
    .prepare(`SELECT status, started_at, ended_at FROM runs WHERE id = ?`)
    .get(runId) as { status: string; started_at: string; ended_at: string | null } | undefined;
  if (run === undefined) return false;
  return run.started_at >= since || run.status === 'running' || (run.ended_at ?? '') >= since;
}
