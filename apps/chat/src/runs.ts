// Stop a scan (R-30 T041, F-13): the BA can end a crawl run without restarting the chat service.
// Stopping marks the run `interrupted`, the same state a pathfinder server leaves when it goes away:
// the crawler's next call gets RUN_STOPPED, and `request_scan` with `resume_run_id` continues it
// from the recorded frontier. Covered by the `docs:review` precedent like every chat write (T037).

import type BetterSqlite3 from 'better-sqlite3';
import { nowIso } from '@pathfinder/core';
import type { WorkflowStepName } from '@pathfinder/chat-model';
import { recordStep } from './steps.js';

export class RunRefusal extends Error {
  constructor(
    readonly code: 'RUN_NOT_FOUND' | 'RUN_NOT_RUNNING' | 'NO_RUNNING_SCAN',
    message: string,
  ) {
    super(message);
    this.name = 'RunRefusal';
  }
}

export interface StoppedRun {
  run_id: string;
  portal_id: string;
  mode: string;
  status: 'interrupted';
}

interface RunRow {
  id: string;
  portal_id: string;
  mode: string;
  status: string;
}

/**
 * `byBa`: the BA asked for the stop ([stop], [stop scan], or the assistant on request). The steps
 * following the run become `stopped` (spec 011 F-04): resumable, no error reference. Without it
 * (an agent left its run running) the step recorder fails the step as before.
 */
export function stopRun(
  raw: BetterSqlite3.Database,
  runId: string,
  opts: { byBa?: boolean } = {},
): StoppedRun {
  const run = raw
    .prepare(`SELECT id, portal_id, mode, status FROM runs WHERE id = ?`)
    .get(runId) as RunRow | undefined;
  if (run === undefined) throw new RunRefusal('RUN_NOT_FOUND', `run ${runId} does not exist`);
  const changed = raw
    .prepare(
      `UPDATE runs SET status = 'interrupted', ended_at = ? WHERE id = ? AND status = 'running'`,
    )
    .run(nowIso(), runId).changes;
  if (changed === 0)
    throw new RunRefusal('RUN_NOT_RUNNING', `run ${runId} is ${run.status}, not running`);
  if (opts.byBa === true) {
    const open = raw
      .prepare(
        `SELECT conversation_id, portal_id, step FROM workflow_steps
         WHERE run_id = ? AND status IN ('pending', 'in_progress')`,
      )
      .all(runId) as { conversation_id: string; portal_id: string; step: WorkflowStepName }[];
    for (const s of open)
      recordStep(raw, {
        conversationId: s.conversation_id,
        portalId: s.portal_id,
        step: s.step,
        status: 'stopped',
      });
  }
  return { run_id: run.id, portal_id: run.portal_id, mode: run.mode, status: 'interrupted' };
}

/** The portal's running run (map or trace), newest first; what "stop the scan" means in the chat. */
export function runningRunOf(raw: BetterSqlite3.Database, portal: string): string {
  const run = raw
    .prepare(
      `SELECT id FROM runs WHERE portal_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1`,
    )
    .get(portal) as { id: string } | undefined;
  if (run === undefined) throw new RunRefusal('NO_RUNNING_SCAN', `no scan of ${portal} is running`);
  return run.id;
}

/** What the chat says after a stop. */
export function stoppedNotice(run: StoppedRun): string {
  if (run.mode !== 'map')
    return `The process trace of ${run.portal_id} was stopped (run ${run.run_id}). Steps already recorded are kept; ask the assistant to trace the process again.`;
  return `The scan of ${run.portal_id} was stopped (run ${run.run_id}). Pages already recorded are kept; press [resume scan] in the step tracker, or ask the assistant, to continue from the pages still queued.`;
}

/** Running runs that a conversation's workflow steps follow: what its [stop] button stops (T050). */
export function runningRunsOfConversation(
  raw: BetterSqlite3.Database,
  conversationId: string,
): string[] {
  return (
    raw
      .prepare(
        `SELECT DISTINCT r.id FROM workflow_steps w JOIN runs r ON r.id = w.run_id
         WHERE w.conversation_id = ? AND r.status = 'running' ORDER BY r.id`,
      )
      .all(conversationId) as { id: string }[]
  ).map((r) => r.id);
}

/** Conversations whose workflow steps follow this run, so each can be told it was stopped. */
export function conversationsOfRun(raw: BetterSqlite3.Database, runId: string): string[] {
  return (
    raw
      .prepare(`SELECT DISTINCT conversation_id FROM workflow_steps WHERE run_id = ?`)
      .all(runId) as { conversation_id: string }[]
  ).map((r) => r.conversation_id);
}
