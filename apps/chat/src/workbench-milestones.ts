// Scan milestones for the live assistant (spec 075 FR-003, the R-96 spike): when a live
// conversation's confirmed scan starts, and when it finishes or stops, the assistant gets an event
// turn with the facts from the store (never its own counting), once each. What was told is kept in
// the command's `result_json.told`, so a restart does not tell it again.

import type BetterSqlite3 from 'better-sqlite3';
import { nowIso } from '@mudpuppy/core';
import { shortScan } from './workbench-commands.js';
import { isLive } from './workbench-live.js';

type Told = 'started' | 'ended';

interface DoneStart {
  id: string;
  conversation_id: string;
  result_json: string;
}

interface RunFacts {
  status: string;
  persona_id: string;
  environment: string;
  warning: string | null;
  pages: number;
  queued: number;
  ended_at: string | null;
  /** A confirmed Stop of this run: the person stopped it (F-08). */
  stopped_by_you: number;
}

/** The crawler's last writes land just after the run's status changes: wait before counting (F-07). */
export const SETTLE_MS = 3000;

export interface Milestone {
  commandId: string;
  conversationId: string;
  told: Told;
  text: string;
}

const RUN_SQL = `SELECT r.status, r.persona_id, r.environment, r.warning, r.ended_at,
  (SELECT count(DISTINCT state_id) FROM state_observations WHERE run_id = r.id) AS pages,
  (SELECT count(*) FROM frontier WHERE run_id = r.id AND status = 'pending') AS queued,
  EXISTS (SELECT 1 FROM workbench_commands c WHERE c.command = 'scan.stop' AND c.state = 'done'
    AND json_extract(c.result_json, '$.run_id') = r.id) AS stopped_by_you
  FROM runs r WHERE r.id = ?`;

const ENDED: Record<string, string> = {
  completed: 'finished',
  interrupted: 'stopped',
  stopped_warning: 'stopped',
};

/** The event line of a milestone. */
export function milestoneText(runId: string, told: Told, run: RunFacts): string {
  const scan = `Scan ${shortScan(runId)} (${runId})`;
  if (told === 'started') return `[event] ${scan} started as ${run.persona_id} on ${run.environment}.`;
  const word = ENDED[run.status] ?? run.status;
  const reason = run.stopped_by_you ? 'the person pressed Stop' : run.warning;
  const why = reason ? ` Why: ${reason}.` : '';
  return `[event] ${scan} ${word}: ${String(run.pages)} pages recorded, ${String(run.queued)} links still queued.${why}`;
}

/** The milestone a run is due for: its end once it ended (and settled), else its start once. */
function dueOf(run: RunFacts, told: Told | undefined, now: number): Told | null {
  if (run.status !== 'running') {
    const settled = run.ended_at === null || now - Date.parse(run.ended_at) >= SETTLE_MS;
    return settled ? 'ended' : null;
  }
  return told === undefined ? 'started' : null;
}

/** The milestones not told yet, for every live conversation's started scans. */
export function dueMilestones(raw: BetterSqlite3.Database, now = Date.now()): Milestone[] {
  const rows = raw
    .prepare(
      `SELECT id, conversation_id, result_json FROM workbench_commands
       WHERE state = 'done' AND command IN ('scan.start', 'scan.resume')`,
    )
    .all() as DoneStart[];
  const due: Milestone[] = [];
  for (const row of rows) {
    const result = JSON.parse(row.result_json) as { run_id?: string; told?: Told };
    if (result.run_id === undefined || result.told === 'ended') continue;
    if (!isLive(raw, row.conversation_id)) continue;
    const run = raw.prepare(RUN_SQL).get(result.run_id) as RunFacts | undefined;
    if (run === undefined) continue;
    const told = dueOf(run, result.told, now);
    if (told === null) continue;
    due.push({
      commandId: row.id,
      conversationId: row.conversation_id,
      told,
      text: milestoneText(result.run_id, told, run),
    });
  }
  return due;
}

/** Note that a milestone was told (after the event turn was accepted). */
export function markTold(raw: BetterSqlite3.Database, m: Milestone): void {
  const row = raw.prepare(`SELECT result_json FROM workbench_commands WHERE id = ?`).get(m.commandId) as
    { result_json: string } | undefined;
  if (row === undefined) return;
  const result = { ...(JSON.parse(row.result_json) as Record<string, unknown>), told: m.told };
  raw
    .prepare(`UPDATE workbench_commands SET result_json = ?, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(result), nowIso(), m.commandId);
}

/**
 * The timer's pass: give each due milestone to its conversation's assistant (an event turn; a
 * busy assistant gets it on a later pass). `send` resolves once the turn was accepted.
 */
export class Milestones {
  private readonly sending = new Set<string>();

  constructor(
    private readonly raw: BetterSqlite3.Database,
    private readonly send: (conversationId: string, text: string) => Promise<void>,
  ) {}

  pass(): void {
    for (const m of dueMilestones(this.raw)) {
      const key = `${m.commandId}:${m.told}`;
      if (this.sending.has(key)) continue;
      this.sending.add(key);
      this.send(m.conversationId, m.text)
        .then(() => markTold(this.raw, m))
        .catch(() => undefined) // busy: the next pass tries again
        .finally(() => this.sending.delete(key));
    }
  }
}
