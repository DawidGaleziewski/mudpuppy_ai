// Write one workflow step row per (conversation, portal, step), validated by the core Zod schema.
// Used by the MCP tools (request accepted → pending) and by the step recorder (T022).

import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from '@mudpuppy/core';
import {
  WorkflowStep,
  type WorkflowStepName,
  type WorkflowStepStatus,
} from '@mudpuppy/chat-model';

export interface StepChange {
  conversationId: string;
  portalId: string;
  step: WorkflowStepName;
  status: WorkflowStepStatus;
  runId?: string | null;
  sessionId?: string | null;
  errorRef?: string | null;
  now?: Date;
}

const OPEN: ReadonlySet<string> = new Set(['pending', 'in_progress']);
const FINISHED: ReadonlySet<string> = new Set(['done', 'failed', 'stopped']);

/** A link the change sets (even to null), else the one the step had. */
const linked = (set: string | null | undefined, had: string | null | undefined): string | null =>
  set !== undefined ? set : (had ?? null);

/**
 * When the step was first requested: the step recorder matches runs and sessions that started
 * after it, so pending → in_progress must not move it.
 */
function startedAt(existing: WorkflowStep | undefined, status: string, now: string): string | null {
  const reopened = OPEN.has(status) && !OPEN.has(existing?.status ?? '');
  return reopened ? now : (existing?.started_at ?? null);
}

export function recordStep(raw: BetterSqlite3.Database, change: StepChange): WorkflowStep {
  const now = nowIso(change.now);
  const existing = raw
    .prepare(
      `SELECT * FROM workflow_steps WHERE conversation_id = ? AND portal_id = ? AND step = ?`,
    )
    .get(change.conversationId, change.portalId, change.step) as WorkflowStep | undefined;
  const row = WorkflowStep.parse({
    id: existing?.id ?? newId(),
    conversation_id: change.conversationId,
    portal_id: change.portalId,
    step: change.step,
    status: change.status,
    run_id: linked(change.runId, existing?.run_id),
    session_id: linked(change.sessionId, existing?.session_id),
    error_ref: change.status === 'failed' ? (change.errorRef ?? null) : null,
    started_at: startedAt(existing, change.status, now),
    finished_at: FINISHED.has(change.status) ? now : null,
    updated_at: now,
  });
  raw
    .prepare(
      `INSERT INTO workflow_steps
         (id, conversation_id, portal_id, step, status, run_id, session_id, error_ref, started_at, finished_at, updated_at)
       VALUES (@id, @conversation_id, @portal_id, @step, @status, @run_id, @session_id, @error_ref, @started_at, @finished_at, @updated_at)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status, run_id = excluded.run_id, session_id = excluded.session_id,
         error_ref = excluded.error_ref, started_at = excluded.started_at,
         finished_at = excluded.finished_at, updated_at = excluded.updated_at`,
    )
    .run(row);
  return row;
}
